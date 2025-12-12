import { Controller, Get } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import * as os from 'os'

@ApiTags('health')
@Controller()
export class AppController {
  @Get('health')
  healthCheck() {
    const uptime = process.uptime()
    const memoryUsage = process.memoryUsage()

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(uptime),
        formatted: this.formatUptime(uptime),
      },
      memory: {
        total: this.formatBytes(memoryUsage.heapTotal),
        used: this.formatBytes(memoryUsage.heapUsed),
        external: this.formatBytes(memoryUsage.external),
        rss: this.formatBytes(memoryUsage.rss),
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        cpuCount: os.cpus().length,
        totalMemory: this.formatBytes(os.totalmem()),
        freeMemory: this.formatBytes(os.freemem()),
        loadAverage: os.loadavg(),
      },
    }
  }

  private formatUptime(uptime: number): string {
    const days = Math.floor(uptime / 86400)
    const hours = Math.floor((uptime % 86400) / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)
    const seconds = Math.floor(uptime % 60)

    return `${days}d ${hours}h ${minutes}m ${seconds}s`
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`
  }
}
