// Proposed NestJS Service Logic
async processChatMessage(dto: ChatMessageDto) {
  const property = await this.propertyRepo.findOne(dto.propertyId);
  
  // Choose the system prompt based on property_type_enum
  const systemPrompt = this.promptService.getPromptForType(property.type);
  
  const aiResponse = await this.llmService.generate(systemPrompt, dto.message);
  
  // aiResponse.extracted_data can now be validated against your 
  // existing RentalApplicationUpdate DTO from rs rest API.txt
  return aiResponse;
}
