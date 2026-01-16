// ============================================================================
// RentStream API Implementation Examples
// NestJS Controllers with Best Practices
// ============================================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ValidationPipe,
  UseInterceptors,
  UploadedFile,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { Request } from 'express';

// ============================================================================
// DTOs (Data Transfer Objects)
// ============================================================================

// Validation decorators from class-validator
import {
  IsString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsDate,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsUUID,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// Authentication DTOs
export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @IsEnum(['landlord', 'tenant', 'maintenance'])
  userType: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsString()
  @IsOptional()
  mfaCode?: string;
}

// Property DTOs
export class CreatePropertyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsString()
  @MinLength(1)
  addressLine1: string;

  @IsString()
  @IsOptional()
  addressLine2?: string;

  @IsString()
  @MinLength(1)
  city: string;

  @IsString()
  @MinLength(1)
  state: string;

  @IsString()
  @MinLength(1)
  zipCode: string;

  @IsEnum(['single_family', 'multi_family', 'apartment', 'condo', 'townhouse'])
  @IsOptional()
  propertyType?: string;

  @IsNumber()
  @Min(1800)
  @Max(new Date().getFullYear() + 5)
  @IsOptional()
  yearBuilt?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  amenities?: string[];
}

export class UpdatePropertyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  amenities?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// Unit DTOs
export class CreateUnitDto {
  @IsString()
  @MinLength(1)
  unitNumber: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  squareFootage?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  bedrooms?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  bathrooms?: number;

  @IsNumber()
  @Min(0)
  rentAmount: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  depositAmount?: number;

  @IsNumber()
  @IsOptional()
  floorNumber?: number;

  @IsBoolean()
  @IsOptional()
  hasParking?: boolean;

  @IsBoolean()
  @IsOptional()
  petFriendly?: boolean;
}

// Maintenance DTOs
export class CreateMaintenanceRequestDto {
  @IsUUID()
  unitId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsString()
  @MinLength(1)
  description: string;

  @IsEnum(['plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'pest_control', 'landscaping', 'other'])
  @IsOptional()
  category?: string;

  @IsEnum(['low', 'medium', 'high', 'emergency'])
  @IsOptional()
  urgencyLevel?: string;
}

export class UpdateMaintenanceRequestDto {
  @IsEnum(['new', 'assigned', 'in_progress', 'pending_parts', 'completed', 'closed', 'cancelled'])
  @IsOptional()
  status?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  estimatedCost?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  actualCost?: number;
}

// Query DTOs
export class PaginationQueryDto {
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number = 1;

  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  limit?: number = 20;
}

export class PropertyFilterDto extends PaginationQueryDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;
}

// ============================================================================
// Guards & Decorators
// ============================================================================

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Custom decorator to get current user from request
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

// Role guard
export class RolesGuard {
  constructor(private reflector: any) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!requiredRoles) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.userType === role);
  }
}

// ============================================================================
// AUTHENTICATION CONTROLLER
// ============================================================================

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: any) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new user account' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(@Body(ValidationPipe) registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login to account' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body(ValidationPipe) loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('logout')
  @UseGuards(/* JwtAuthGuard */)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and invalidate token' })
  async logout(@CurrentUser() user: any) {
    return this.authService.logout(user.id);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Post('mfa/enable')
  @UseGuards(/* JwtAuthGuard */)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable MFA for account' })
  async enableMfa(@CurrentUser() user: any) {
    return this.authService.enableMfa(user.id);
  }

  @Post('mfa/verify')
  @UseGuards(/* JwtAuthGuard */)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify and activate MFA' })
  async verifyMfa(
    @CurrentUser() user: any,
    @Body('code') code: string,
  ) {
    return this.authService.verifyMfa(user.id, code);
  }
}

// ============================================================================
// PROPERTY CONTROLLER
// ============================================================================

@ApiTags('Properties')
@Controller('properties')
@UseGuards(/* JwtAuthGuard, RolesGuard */)
@ApiBearerAuth()
export class PropertyController {
  constructor(private readonly propertyService: any) {}

  @Get()
  @ApiOperation({ summary: 'List all properties' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'city', required: false, type: String })
  @ApiQuery({ name: 'state', required: false, type: String })
  async findAll(
    @CurrentUser() user: any,
    @Query(ValidationPipe) query: PropertyFilterDto,
  ) {
    return this.propertyService.findAll(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create new property' })
  @ApiResponse({ status: 201, description: 'Property created' })
  @ApiResponse({ status: 403, description: 'Forbidden - Landlords only' })
  async create(
    @CurrentUser() user: any,
    @Body(ValidationPipe) createPropertyDto: CreatePropertyDto,
  ) {
    if (user.userType !== 'landlord') {
      throw new Error('Only landlords can create properties');
    }
    return this.propertyService.create(user.id, createPropertyDto);
  }

  @Get(':propertyId')
  @ApiOperation({ summary: 'Get property details' })
  @ApiResponse({ status: 200, description: 'Property details' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  async findOne(
    @CurrentUser() user: any,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ) {
    return this.propertyService.findOne(user, propertyId);
  }

  @Patch(':propertyId')
  @ApiOperation({ summary: 'Update property' })
  async update(
    @CurrentUser() user: any,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body(ValidationPipe) updatePropertyDto: UpdatePropertyDto,
  ) {
    return this.propertyService.update(user, propertyId, updatePropertyDto);
  }

  @Delete(':propertyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete property' })
  @ApiResponse({ status: 204, description: 'Property deleted' })
  @ApiResponse({ status: 409, description: 'Cannot delete property with active leases' })
  async remove(
    @CurrentUser() user: any,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ) {
    return this.propertyService.remove(user, propertyId);
  }

  @Get(':propertyId/units')
  @ApiOperation({ summary: 'List units in property' })
  @ApiQuery({ name: 'status', required: false, enum: ['vacant', 'occupied', 'maintenance'] })
  async getUnits(
    @CurrentUser() user: any,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Query('status') status?: string,
  ) {
    return this.propertyService.getUnits(user, propertyId, status);
  }

  @Post(':propertyId/units')
  @ApiOperation({ summary: 'Add unit to property' })
  @ApiResponse({ status: 201, description: 'Unit created' })
  async createUnit(
    @CurrentUser() user: any,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body(ValidationPipe) createUnitDto: CreateUnitDto,
  ) {
    return this.propertyService.createUnit(user, propertyId, createUnitDto);
  }
}

// ============================================================================
// MAINTENANCE CONTROLLER
// ============================================================================

@ApiTags('Maintenance')
@Controller('maintenance-requests')
@UseGuards(/* JwtAuthGuard */)
@ApiBearerAuth()
export class MaintenanceController {
  constructor(private readonly maintenanceService: any) {}

  @Get()
  @ApiOperation({ summary: 'List maintenance requests' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'urgency', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'propertyId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @CurrentUser() user: any,
    @Query() query: any,
  ) {
    return this.maintenanceService.findAll(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create maintenance request' })
  @ApiResponse({ status: 201, description: 'Request created' })
  async create(
    @CurrentUser() user: any,
    @Body(ValidationPipe) createDto: CreateMaintenanceRequestDto,
  ) {
    if (user.userType !== 'tenant') {
      throw new Error('Only tenants can create maintenance requests');
    }
    return this.maintenanceService.create(user.id, createDto);
  }

  @Get(':requestId')
  @ApiOperation({ summary: 'Get maintenance request details' })
  async findOne(
    @CurrentUser() user: any,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.maintenanceService.findOne(user, requestId);
  }

  @Patch(':requestId')
  @ApiOperation({ summary: 'Update maintenance request' })
  async update(
    @CurrentUser() user: any,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body(ValidationPipe) updateDto: UpdateMaintenanceRequestDto,
  ) {
    return this.maintenanceService.update(user, requestId, updateDto);
  }

  @Post(':requestId/assign')
  @ApiOperation({ summary: 'Assign request to personnel' })
  async assign(
    @CurrentUser() user: any,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body('personnelId', ParseUUIDPipe) personnelId: string,
    @Body('notes') notes?: string,
  ) {
    if (user.userType !== 'landlord') {
      throw new Error('Only landlords can assign requests');
    }
    return this.maintenanceService.assign(user, requestId, personnelId, notes);
  }

  @Post(':requestId/media')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload media to maintenance request' })
  async uploadMedia(
    @CurrentUser() user: any,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('stage') stage?: string,
  ) {
    return this.maintenanceService.uploadMedia(user, requestId, file, stage);
  }

  @Get(':requestId/comments')
  @ApiOperation({ summary: 'Get request comments/logs' })
  async getComments(
    @CurrentUser() user: any,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.maintenanceService.getComments(user, requestId);
  }

  @Post(':requestId/comments')
  @ApiOperation({ summary: 'Add comment to request' })
  async addComment(
    @CurrentUser() user: any,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body('notes') notes: string,
  ) {
    return this.maintenanceService.addComment(user, requestId, notes);
  }
}

// ============================================================================
// PAYMENT CONTROLLER
// ============================================================================

@ApiTags('Payments')
@Controller('payments')
@UseGuards(/* JwtAuthGuard */)
@ApiBearerAuth()
export class PaymentController {
  constructor(private readonly paymentService: any) {}

  @Get()
  @ApiOperation({ summary: 'List payments' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async findAll(
    @CurrentUser() user: any,
    @Query() query: any,
  ) {
    return this.paymentService.findAll(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create payment' })
  @ApiResponse({ status: 201, description: 'Payment initiated' })
  async create(
    @CurrentUser() user: any,
    @Body() createPaymentDto: any,
  ) {
    if (user.userType !== 'tenant') {
      throw new Error('Only tenants can create payments');
    }
    return this.paymentService.create(user.id, createPaymentDto);
  }

  @Get(':paymentId')
  @ApiOperation({ summary: 'Get payment details' })
  async findOne(
    @CurrentUser() user: any,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.paymentService.findOne(user, paymentId);
  }

  @Get(':paymentId/receipt')
  @ApiOperation({ summary: 'Get payment receipt' })
  async getReceipt(
    @CurrentUser() user: any,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Req() req: Request,
  ) {
    const receipt = await this.paymentService.generateReceipt(user, paymentId);
    req.res.setHeader('Content-Type', 'application/pdf');
    req.res.setHeader('Content-Disposition', `attachment; filename="receipt-${paymentId}.pdf"`);
    return receipt;
  }
}

// ============================================================================
// MIDDLEWARE & ERROR HANDLING
// ============================================================================

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || message;
        code = (exceptionResponse as any).error || code;
      }
    }

    response.status(status).json({
      error: {
        code,
        message,
        details,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// ============================================================================
// LOGGING INTERCEPTOR
// ============================================================================

import {
  Injectable,
  NestInterceptor,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: (data) => {
          const responseTime = Date.now() - startTime;
          this.logger.log(
            `${method} ${url} - ${responseTime}ms - ${HttpStatus.OK}`
          );
        },
        error: (error) => {
          const responseTime = Date.now() - startTime;
          this.logger.error(
            `${method} ${url} - ${responseTime}ms - ${error.status || 500}`
          );
        },
      }),
    );
  }
}

// ============================================================================
// RATE LIMITING
// ============================================================================

import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): string {
    // Use user ID if authenticated, otherwise IP address
    return req.user?.id || req.ip;
  }
}

// ============================================================================
// MAIN APPLICATION SETUP
// ============================================================================

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe as NestValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(/* AppModule */);

  // Global prefix
  app.setGlobalPrefix('v1');

  // CORS
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new NestValidationPipe({
      whitelist: true, // Strip non-whitelisted properties
      forbidNonWhitelisted: true, // Throw error if non-whitelisted
      transform: true, // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global interceptors
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('RentStream API')
    .setDescription('Property Management Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Authentication')
    .addTag('Properties')
    .addTag('Leases')
    .addTag('Payments')
    .addTag('Maintenance')
    .addTag('Applications')
    .addTag('Listings')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(process.env.PORT || 3000);
  
  console.log(`🚀 Application running on: http://localhost:${process.env.PORT || 3000}`);
  console.log(`📚 API Documentation: http://localhost:${process.env.PORT || 3000}/api-docs`);
}

bootstrap();