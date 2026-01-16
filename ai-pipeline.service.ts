@Injectable()
export class AiLeasingService {
  async processStep(chatDto: ChatMessageDto, property: Property) {
    // 1. Fetch the specific prompt for this property type
    const systemPrompt = this.promptGenerator.build(property);

    // 2. Call the LLM (Claude/OpenAI)
    const response = await this.llm.chat({
      system: systemPrompt,
      messages: chatDto.history,
      format: 'json'
    });

    const data = JSON.parse(response.content);

    // 3. Update the Application record in RentStream DB
    if (data.extracted_data.status.can_submit) {
      await this.applicationRepo.update(chatDto.appId, {
        raw_data: data.extracted_data,
        status: 'under_review'
      });
    }

    return data;
  }
}
