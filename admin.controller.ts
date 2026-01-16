// src/admin/admin.controller.ts
import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@UseGuards(AdminGuard) // Only users with type 'admin' can access
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: 'List all users across the platform' })
  async getAllUsers(@Query('type') type?: string) {
    return this.adminService.findAllUsers(type);
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'View system-wide activity logs' })
  async getAuditLogs(
    @Query('tableName') tableName?: string,
    @Query('limit') limit: number = 50
  ) {
    // This queries the audit_logs table created in Migration 013
    return this.adminService.getSystemLogs(tableName, limit);
  }

  @Patch('users/:id/suspend')
  async suspendUser(@Param('id') id: string) {
    return this.adminService.updateUserStatus(id, false);
  }

  @Get('system-health')
  async getHealth() {
    // Queries the query_performance_log from rs 3.txt
    return this.adminService.getPerformanceMetrics();
  }
}
