@Injectable()
export class AiLeasingService {
  async *processAndStream(userMsg: string, listingId: string) {
    const listing = await this.listingRepo.findOne(listingId);
    const rent = listing.monthly_rent;

    // Call LLM with streaming enabled
    const stream = await this.llm.stream(userMsg, propertyContext);

    for await (const chunk of stream) {
      const extracted = chunk.extracted_data;
      
      // LOGIC: Instant Validation
      let preQualStatus = 'pending';
      if (extracted.financials?.annual_income) {
        const monthlyIncome = extracted.financials.annual_income / 12;
        // Check if they meet the 3x rent requirement
        preQualStatus = monthlyIncome >= (rent * 3) ? 'qualified' : 'manual_review';
      }

      yield {
        textChunk: chunk.text,
        currentSchema: { ...extracted, preQualStatus },
        completionPercentage: this.calculateProgress(extracted),
        isReady: this.validateRequiredFields(extracted, listing.property_type)
      };
    }
  }

  private calculateProgress(data: any): number {
    // Counts non-null fields in the JSON vs total required fields
    // Returns a value 0-100 for your React progress bar
  }
}
