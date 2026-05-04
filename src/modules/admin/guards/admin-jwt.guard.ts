import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

// Use this on every endpoint under /admin/* (except login / refresh).
// Trigger: missing / invalid / expired token → 401. Active token →
// req.user is set to the Admin entity (see AdminJwtStrategy.validate).
@Injectable()
export class AdminJwtGuard extends AuthGuard('admin-jwt') {}
