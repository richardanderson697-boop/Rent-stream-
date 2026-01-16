// src/common/guards/feature.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/core';
import { Reflector } from '@nestjs/core';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.get<string>('feature', context.getHandler());
    if (!requiredFeature) return true;

    const { user } = context.switchToHttp().getRequest();
    const tier = user.subscriptionTier; // 'free', 'pro', or 'enterprise'

    const limits = {
      free: { maxUnits: 2, automation: false, analytics: 'basic' },
      pro: { maxUnits: 50, automation: true, analytics: 'advanced' },
      enterprise: { maxUnits: Infinity, automation: true, analytics: 'full' },
    };

    if (requiredFeature === 'automation' && !limits[tier].automation) {
      throw new ForbiddenException('Automated late fees require a Pro subscription.');
    }

    return true;
  }
}
