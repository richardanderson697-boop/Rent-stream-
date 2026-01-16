import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lease } from './entities/lease.entity';
import { Payment } from '../payments/entities/payment.entity';
import { differenceInDays } from 'date-fns';

@Injectable()
export class LateFeeService {
  constructor(
    @InjectRepository(Lease)
    private leaseRepository: Repository<Lease>,
  ) {}

  /**
   * Calculates the late fee for a specific payment
   * @param payment The payment record to check
   * @param currentDate Usually today, but can be customized for testing
   */
  async calculateLateFee(payment: Payment, currentDate: Date = new Date()): Promise<number> {
    const lease = await this.leaseRepository.findOne({ where: { id: payment.leaseId } });
    
    if (!lease || !lease.late_fee_type) return 0;

    const daysLate = differenceInDays(currentDate, payment.due_date);
    
    // Check if we are still within the grace period
    if (daysLate <= lease.grace_period_days) {
      return 0;
    }

    let calculatedFee = 0;
    const flatFee = Number(lease.late_fee_amount);
    const percentageFee = (Number(lease.monthly_rent) * Number(lease.late_fee_percentage)) / 100;

    switch (lease.late_fee_type) {
      case 'flat_fee':
        calculatedFee = flatFee;
        break;
      case 'percentage':
        calculatedFee = percentageFee;
        break;
      case 'greater_of_both':
        calculatedFee = Math.max(flatFee, percentageFee);
        break;
      default:
        calculatedFee = 0;
    }

    return parseFloat(calculatedFee.toFixed(2));
  }
}
