import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RegisterAdminDto } from '../dto/register.dto'
import { UpdateAdminDto } from '../dto/update-admin.dto'
import { UpdateOwnAdminProfileDto } from '../dto/update-own-profile.dto'
import { Admin, SafeAdmin } from '../entities/admin.entity'
import { AdminRole } from '../types/admin-role.enum'
import {
  normalizeAdminProfileUpdate,
  validateAdminAvatarUrl,
} from '../utils/admin-profile'
import { AdminAuthService } from './admin-auth.service'

// CRUD on admin records. All endpoints calling these methods are
// gated by AdminRolesGuard at the controller layer — service trusts
// the caller is authorised. Where a method has additional invariants
// (e.g. "can't demote yourself"), they're enforced explicitly here.
@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Admin)
    private readonly admins: Repository<Admin>,
    private readonly auth: AdminAuthService,
  ) {}

  async create(dto: RegisterAdminDto, createdById: string): Promise<SafeAdmin> {
    const email = dto.email.toLowerCase().trim()
    await this.auth.ensureEmailFree(email)

    const passwordHash = await this.auth.hashPassword(dto.password)
    const admin = this.admins.create({
      email,
      password_hash: passwordHash,
      first_name: dto.first_name,
      last_name: dto.last_name,
      role: dto.role,
      is_active: true,
      created_by_id: createdById,
    })
    const saved = await this.admins.save(admin)
    return saved.toSafeJson()
  }

  async findAll(): Promise<SafeAdmin[]> {
    const rows = await this.admins.find({ order: { created_at: 'DESC' } })
    return rows.map(r => r.toSafeJson())
  }

  async findById(id: string): Promise<SafeAdmin> {
    const admin = await this.admins.findOne({ where: { id } })
    if (!admin) throw new NotFoundException('Admin not found')
    return admin.toSafeJson()
  }

  async updateOwnProfile(
    admin: Admin,
    dto: UpdateOwnAdminProfileDto,
  ): Promise<SafeAdmin> {
    const patch = normalizeAdminProfileUpdate(dto)

    if (patch.first_name !== undefined) {
      if (!patch.first_name) throw new BadRequestException('First name required')
      admin.first_name = patch.first_name
    }

    if (patch.last_name !== undefined) {
      if (!patch.last_name) throw new BadRequestException('Last name required')
      admin.last_name = patch.last_name
    }

    if (patch.avatar_url !== undefined) {
      if (patch.avatar_url !== null && !validateAdminAvatarUrl(patch.avatar_url)) {
        throw new BadRequestException(
          'Avatar must be a PNG, JPEG, or WebP data URL',
        )
      }
      admin.avatar_url = patch.avatar_url
    }

    const saved = await this.admins.save(admin)
    return saved.toSafeJson()
  }

  async update(
    id: string,
    dto: UpdateAdminDto,
    requester: Admin,
  ): Promise<SafeAdmin> {
    const target = await this.admins.findOne({ where: { id } })
    if (!target) throw new NotFoundException('Admin not found')

    // Self-protection rules:
    //   - Can't deactivate yourself (lock-out risk)
    //   - Can't demote yourself out of super_admin (would lose
    //     ability to undo the change)
    if (target.id === requester.id) {
      if (dto.is_active === false) {
        throw new ForbiddenException("Can't deactivate your own account")
      }
      if (
        requester.role === AdminRole.SUPER_ADMIN &&
        dto.role !== undefined &&
        dto.role !== AdminRole.SUPER_ADMIN
      ) {
        throw new ForbiddenException("Can't demote yourself from super_admin")
      }
    }

    // No promoting to super_admin unless requester is super_admin.
    // Controller-level RolesGuard already restricts this endpoint to
    // super_admin, but defense-in-depth — duplicate check here.
    if (
      dto.role === AdminRole.SUPER_ADMIN &&
      requester.role !== AdminRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only super_admin can grant super_admin role',
      )
    }

    if (dto.first_name !== undefined) target.first_name = dto.first_name
    if (dto.last_name !== undefined) target.last_name = dto.last_name
    if (dto.role !== undefined) target.role = dto.role
    if (dto.is_active !== undefined) target.is_active = dto.is_active

    if (dto.password) {
      target.password_hash = await this.auth.hashPassword(dto.password)
      // Password change → invalidate every existing session (other
      // devices). Current session continues until access token expires.
      await this.auth.revokeAllForAdmin(target.id)
    }

    // If admin is being deactivated, kill all their sessions immediately.
    if (dto.is_active === false) {
      await this.auth.revokeAllForAdmin(target.id)
    }

    const saved = await this.admins.save(target)
    return saved.toSafeJson()
  }

  async remove(id: string, requester: Admin): Promise<void> {
    if (id === requester.id) {
      throw new ForbiddenException("Can't delete your own account")
    }
    const target = await this.admins.findOne({ where: { id } })
    if (!target) throw new NotFoundException('Admin not found')

    // Sessions cascade-delete via FK (admin_refresh_tokens.admin_id).
    await this.admins.remove(target)
  }
}
