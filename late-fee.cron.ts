@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async handleLateFees() {
  const overduePayments = await this.paymentService.findOverdue();
  
  for (const payment of overduePayments) {
    const fee = await this.lateFeeService.calculateLateFee(payment);
    if (fee > 0 && !payment.late_fee_applied) {
      await this.paymentService.applyLateFee(payment.id, fee);
      await this.notificationService.notifyTenant(payment.tenantId, `A late fee of $${fee} has been applied.`);
    }
  }
}
