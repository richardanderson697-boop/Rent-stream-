// ============================================================================
// RentStream AI Leasing Assistant
// Natural Language Application Processing with OpenAI/Claude
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// AI Service Configuration
// ============================================================================

export interface AIConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model: string;
  maxTokens: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ApplicationData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  desiredMoveInDate?: string;
  numOccupants?: number;
  hasPets?: boolean;
  petDetails?: string;
  employmentStatus?: string;
  employerName?: string;
  annualIncome?: number;
  currentAddress?: string;
  reasonForMoving?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export interface ConversationState {
  listingId: string;
  conversationId: string;
  messages: ConversationMessage[];
  extractedData: ApplicationData;
  preQualificationStatus?: 'pending' | 'qualified' | 'disqualified';
  disqualificationReasons?: string[];
  completionPercentage: number;
  nextQuestion?: string;
}

// ============================================================================
// AI Leasing Assistant Service
// ============================================================================

@Injectable()
export class AILeasingAssistantService {
  private readonly logger = new Logger(AILeasingAssistantService.name);
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Initialize a new conversation for a rental application
   */
  async startConversation(
    listingId: string,
    listingDetails: any,
    propertyRequirements: any
  ): Promise<ConversationState> {
    const conversationId = this.generateConversationId();
    
    const systemPrompt = this.buildSystemPrompt(listingDetails, propertyRequirements);
    
    const initialMessage = await this.generateInitialMessage(listingDetails);

    return {
      listingId,
      conversationId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'assistant', content: initialMessage }
      ],
      extractedData: {},
      completionPercentage: 0,
      nextQuestion: initialMessage,
    };
  }

  /**
   * Process user message and continue conversation
   */
  async processMessage(
    conversationState: ConversationState,
    userMessage: string,
    propertyRequirements: any
  ): Promise<ConversationState> {
    // Add user message to history
    conversationState.messages.push({
      role: 'user',
      content: userMessage,
    });

    // Extract data from conversation
    const extractedData = await this.extractApplicationData(
      conversationState.messages
    );

    // Merge with existing data
    conversationState.extractedData = {
      ...conversationState.extractedData,
      ...extractedData,
    };

    // Calculate completion percentage
    conversationState.completionPercentage = this.calculateCompletion(
      conversationState.extractedData
    );

    // Pre-qualify applicant
    const preQualification = await this.preQualifyApplicant(
      conversationState.extractedData,
      propertyRequirements
    );

    conversationState.preQualificationStatus = preQualification.status;
    conversationState.disqualificationReasons = preQualification.reasons;

    // Generate next response
    const nextResponse = await this.generateNextResponse(
      conversationState,
      propertyRequirements
    );

    conversationState.messages.push({
      role: 'assistant',
      content: nextResponse,
    });

    conversationState.nextQuestion = nextResponse;

    return conversationState;
  }

  /**
   * Build system prompt for the AI assistant
   */
  private buildSystemPrompt(
    listingDetails: any,
    propertyRequirements: any
  ): string {
    return `You are a professional leasing assistant for RentStream, helping prospective tenants apply for a rental property.

PROPERTY DETAILS:
- Address: ${listingDetails.address}
- Rent: $${listingDetails.monthlyRent}/month
- Bedrooms: ${listingDetails.bedrooms}
- Bathrooms: ${listingDetails.bathrooms}
- Pet Policy: ${listingDetails.petFriendly ? 'Pets allowed' : 'No pets'}
- Available: ${listingDetails.availableDate}

REQUIREMENTS:
- Minimum income: ${propertyRequirements.minIncome || '3x monthly rent'}
- Credit score: ${propertyRequirements.minCreditScore || 650}+
- Background check required
${propertyRequirements.noPets ? '- No pets allowed' : ''}
${propertyRequirements.noSmoking ? '- No smoking' : ''}

YOUR ROLE:
1. Engage in natural, friendly conversation to collect application information
2. Ask ONE question at a time to avoid overwhelming the applicant
3. Be conversational and empathetic - this is a major life decision
4. Gently probe for details when answers are vague
5. Explain why you need certain information when relevant
6. Keep responses concise (2-3 sentences max per response)

INFORMATION TO COLLECT:
- Full name (first and last)
- Email address
- Phone number
- Desired move-in date
- Number of occupants
- Pet information (if applicable)
- Employment status and employer
- Annual income
- Current address
- Reason for moving
- Emergency contact

CONVERSATION STYLE:
- Warm and professional
- Use the applicant's name once you know it
- Acknowledge their answers before moving to the next question
- If they provide multiple pieces of information at once, acknowledge all of it
- Show enthusiasm about the property when appropriate

PRE-QUALIFICATION:
- If income is less than 3x rent, note this but continue professionally
- If they have pets and property doesn't allow them, inform them gently
- If any dealbreakers arise, be honest but kind

Remember: You're helping someone find their next home. Be helpful, efficient, and human.`;
  }

  /**
   * Generate initial greeting message
   */
  private async generateInitialMessage(listingDetails: any): Promise<string> {
    return `Hi! 👋 I'm here to help you apply for the ${listingDetails.bedrooms}-bedroom apartment at ${listingDetails.address}. 

I'll walk you through the application process - it'll just take a few minutes and we can do it conversationally. No long forms to fill out!

To get started, what's your full name?`;
  }

  /**
   * Extract structured data from conversation using Claude
   */
  private async extractApplicationData(
    messages: ConversationMessage[]
  ): Promise<ApplicationData> {
    const extractionPrompt = `Analyze this conversation and extract all application data mentioned. Return ONLY a JSON object with the fields you can identify. Use null for any field not mentioned.

Conversation:
${messages.filter(m => m.role !== 'system').map(m => `${m.role}: ${m.content}`).join('\n')}

Extract these fields if mentioned:
- firstName (string)
- lastName (string)
- email (string)
- phoneNumber (string)
- desiredMoveInDate (ISO date string)
- numOccupants (number)
- hasPets (boolean)
- petDetails (string)
- employmentStatus (string: employed/self-employed/unemployed/retired/student)
- employerName (string)
- annualIncome (number)
- currentAddress (string)
- reasonForMoving (string)
- emergencyContactName (string)
- emergencyContactPhone (string)

Return ONLY valid JSON, no markdown formatting.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: extractionPrompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type === 'text') {
      try {
        // Remove markdown code blocks if present
        let jsonText = content.text.trim();
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        
        const extracted = JSON.parse(jsonText);
        return extracted;
      } catch (error) {
        this.logger.error('Failed to parse extracted data', error);
        return {};
      }
    }

    return {};
  }

  /**
   * Generate next response in conversation
   */
  private async generateNextResponse(
    conversationState: ConversationState,
    propertyRequirements: any
  ): Promise<string> {
    const systemMessage = conversationState.messages.find(m => m.role === 'system');
    const conversationMessages = conversationState.messages.filter(m => m.role !== 'system');

    // Build context about what we still need
    const missingFields = this.getMissingRequiredFields(conversationState.extractedData);
    const contextPrompt = missingFields.length > 0
      ? `\n\nSTILL NEEDED: ${missingFields.join(', ')}\nAsk for the NEXT missing field. Only ask ONE question.`
      : '\n\nAll required information collected. Confirm details and ask if they want to submit.';

    const messages = [
      {
        role: 'user' as const,
        content: systemMessage.content + contextPrompt,
      },
      ...conversationMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages,
    });

    const content = response.content[0];
    return content.type === 'text' ? content.text : '';
  }

  /**
   * Pre-qualify applicant based on requirements
   */
  private async preQualifyApplicant(
    data: ApplicationData,
    requirements: any
  ): Promise<{ status: 'pending' | 'qualified' | 'disqualified'; reasons: string[] }> {
    const reasons: string[] = [];
    
    // Check income requirement (3x rent)
    if (data.annualIncome && requirements.monthlyRent) {
      const monthlyIncome = data.annualIncome / 12;
      const requiredIncome = requirements.monthlyRent * 3;
      
      if (monthlyIncome < requiredIncome) {
        reasons.push(`Income below requirement (need $${requiredIncome.toFixed(0)}/month, have $${monthlyIncome.toFixed(0)}/month)`);
      }
    }

    // Check pet policy
    if (data.hasPets && !requirements.petFriendly) {
      reasons.push('Property does not allow pets');
    }

    // Check occupancy limits
    if (data.numOccupants && requirements.maxOccupants) {
      if (data.numOccupants > requirements.maxOccupants) {
        reasons.push(`Too many occupants (max ${requirements.maxOccupants})`);
      }
    }

    // Determine status
    if (reasons.length === 0) {
      return { status: 'qualified', reasons: [] };
    } else if (this.hasHardDisqualifiers(reasons)) {
      return { status: 'disqualified', reasons };
    } else {
      return { status: 'pending', reasons };
    }
  }

  /**
   * Check if disqualification reasons are hard stops
   */
  private hasHardDisqualifiers(reasons: string[]): boolean {
    const hardDisqualifiers = ['does not allow pets', 'Too many occupants'];
    return reasons.some(reason => 
      hardDisqualifiers.some(hard => reason.includes(hard))
    );
  }

  /**
   * Calculate application completion percentage
   */
  private calculateCompletion(data: ApplicationData): number {
    const requiredFields = [
      'firstName',
      'lastName',
      'email',
      'phoneNumber',
      'desiredMoveInDate',
      'numOccupants',
      'employmentStatus',
      'annualIncome',
    ];

    const completedFields = requiredFields.filter(field => {
      const value = data[field as keyof ApplicationData];
      return value !== undefined && value !== null && value !== '';
    });

    return Math.round((completedFields.length / requiredFields.length) * 100);
  }

  /**
   * Get list of missing required fields
   */
  private getMissingRequiredFields(data: ApplicationData): string[] {
    const fieldMap = {
      firstName: 'first name',
      lastName: 'last name',
      email: 'email address',
      phoneNumber: 'phone number',
      desiredMoveInDate: 'desired move-in date',
      numOccupants: 'number of occupants',
      hasPets: 'pet information',
      employmentStatus: 'employment status',
      employerName: 'employer name',
      annualIncome: 'annual income',
      emergencyContactName: 'emergency contact',
    };

    const missing: string[] = [];

    Object.entries(fieldMap).forEach(([field, label]) => {
      const value = data[field as keyof ApplicationData];
      if (value === undefined || value === null || value === '') {
        missing.push(label);
      }
    });

    return missing;
  }

  /**
   * Generate unique conversation ID
   */
  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Convert conversation to final application
   */
  async finalizeApplication(
    conversationState: ConversationState,
    userId: string
  ): Promise<any> {
    const data = conversationState.extractedData;

    return {
      listingId: conversationState.listingId,
      applicantId: userId,
      status: conversationState.preQualificationStatus === 'qualified' 
        ? 'under_review' 
        : 'pending',
      desiredMoveInDate: data.desiredMoveInDate,
      numOccupants: data.numOccupants,
      hasPets: data.hasPets,
      petDetails: data.petDetails,
      employmentStatus: data.employmentStatus,
      employerName: data.employerName,
      annualIncome: data.annualIncome,
      notes: `Application completed via AI assistant. Conversation ID: ${conversationState.conversationId}`,
      metadata: {
        conversationId: conversationState.conversationId,
        completionPercentage: conversationState.completionPercentage,
        preQualificationStatus: conversationState.preQualificationStatus,
        disqualificationReasons: conversationState.disqualificationReasons,
      },
    };
  }
}

// ============================================================================
// AI Assistant Controller
// ============================================================================

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('AI Assistant')
@Controller('ai-assistant')
@UseGuards(/* JwtAuthGuard */)
@ApiBearerAuth()
export class AIAssistantController {
  constructor(
    private readonly aiService: AILeasingAssistantService,
    private readonly listingService: any, // RentalListingService
    private readonly applicationService: any, // RentalApplicationService
  ) {}

  @Post('conversations/start/:listingId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start AI-assisted application conversation' })
  @ApiResponse({ status: 201, description: 'Conversation started' })
  async startConversation(
    @Param('listingId') listingId: string,
    @CurrentUser() user: any,
  ) {
    // Get listing details
    const listing = await this.listingService.findOne(listingId);
    
    // Get property requirements
    const property = await listing.property;
    const requirements = {
      monthlyRent: listing.monthlyRent,
      petFriendly: listing.unit.petFriendly,
      maxOccupants: listing.unit.bedrooms * 2, // Simple rule
      minIncome: listing.monthlyRent * 3,
      minCreditScore: 650,
    };

    // Start conversation
    const conversation = await this.aiService.startConversation(
      listingId,
      {
        address: `${property.addressLine1}, ${property.city}, ${property.state}`,
        monthlyRent: listing.monthlyRent,
        bedrooms: listing.unit.bedrooms,
        bathrooms: listing.unit.bathrooms,
        petFriendly: listing.unit.petFriendly,
        availableDate: listing.availableDate,
      },
      requirements
    );

    // Store conversation in cache/database
    await this.storeConversation(user.id, conversation);

    return {
      conversationId: conversation.conversationId,
      message: conversation.nextQuestion,
      completionPercentage: 0,
    };
  }

  @Post('conversations/:conversationId/message')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send message in conversation' })
  async sendMessage(
    @Param('conversationId') conversationId: string,
    @Body('message') message: string,
    @CurrentUser() user: any,
  ) {
    // Retrieve conversation state
    const conversationState = await this.retrieveConversation(user.id, conversationId);

    // Get property requirements
    const listing = await this.listingService.findOne(conversationState.listingId);
    const property = await listing.property;
    const requirements = {
      monthlyRent: listing.monthlyRent,
      petFriendly: listing.unit.petFriendly,
      maxOccupants: listing.unit.bedrooms * 2,
      minIncome: listing.monthlyRent * 3,
    };

    // Process message
    const updatedState = await this.aiService.processMessage(
      conversationState,
      message,
      requirements
    );

    // Update stored conversation
    await this.storeConversation(user.id, updatedState);

    return {
      conversationId: updatedState.conversationId,
      message: updatedState.nextQuestion,
      completionPercentage: updatedState.completionPercentage,
      extractedData: updatedState.extractedData,
      preQualificationStatus: updatedState.preQualificationStatus,
      canSubmit: updatedState.completionPercentage >= 100,
    };
  }

  @Post('conversations/:conversationId/submit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit application from conversation' })
  async submitApplication(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: any,
  ) {
    // Retrieve conversation
    const conversationState = await this.retrieveConversation(user.id, conversationId);

    if (conversationState.completionPercentage < 100) {
      throw new Error('Application is not complete');
    }

    // Create application from conversation
    const applicationData = await this.aiService.finalizeApplication(
      conversationState,
      user.id
    );

    // Submit application
    const application = await this.applicationService.create(applicationData);

    // Clean up conversation
    await this.deleteConversation(user.id, conversationId);

    return {
      applicationId: application.id,
      status: application.status,
      message: 'Application submitted successfully!',
    };
  }

  @Get('conversations/:conversationId')
  @ApiOperation({ summary: 'Get conversation state' })
  async getConversation(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: any,
  ) {
    const conversation = await this.retrieveConversation(user.id, conversationId);
    
    return {
      conversationId: conversation.conversationId,
      completionPercentage: conversation.completionPercentage,
      extractedData: conversation.extractedData,
      preQualificationStatus: conversation.preQualificationStatus,
      messages: conversation.messages.filter(m => m.role !== 'system'),
    };
  }

  // Helper methods for storing/retrieving conversations
  // In production, use Redis or database
  private async storeConversation(userId: string, state: ConversationState) {
    // Store in Redis with TTL of 24 hours
    const key = `ai_conversation:${userId}:${state.conversationId}`;
    // await this.redis.setex(key, 86400, JSON.stringify(state));
  }

  private async retrieveConversation(userId: string, conversationId: string): Promise<ConversationState> {
    const key = `ai_conversation:${userId}:${conversationId}`;
    // const data = await this.redis.get(key);
    // return JSON.parse(data);
    return {} as ConversationState; // Placeholder
  }

  private async deleteConversation(userId: string, conversationId: string) {
    const key = `ai_conversation:${userId}:${conversationId}`;
    // await this.redis.del(key);
  }
}

// ============================================================================
// Environment Configuration
// ============================================================================

/*
Add to .env:

# AI Configuration
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
AI_MODEL=claude-sonnet-4-20250514
AI_MAX_TOKENS=4000

# Feature Flags
AI_ASSISTANT_ENABLED=true
AI_ASSISTANT_TIERS=pro,enterprise

# Rate Limiting
AI_REQUESTS_PER_HOUR=100
*/

// ============================================================================
// Usage Example - Frontend Integration
// ============================================================================

/*
// React Component Example

import { useState, useEffect } from 'react';

export function AIApplicationChat({ listingId }) {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [completion, setCompletion] = useState(0);

  // Start conversation
  useEffect(() => {
    async function start() {
      const response = await fetch(`/api/ai-assistant/conversations/start/${listingId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      
      setConversationId(data.conversationId);
      setMessages([{ role: 'assistant', content: data.message }]);
    }
    start();
  }, [listingId]);

  // Send message
  async function sendMessage() {
    if (!input.trim()) return;

    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: input }]);

    const response = await fetch(`/api/ai-assistant/conversations/${conversationId}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message: input }),
    });

    const data = await response.json();
    
    setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    setCompletion(data.completionPercentage);
    setInput('');
    setLoading(false);
  }

  // Submit application
  async function submit() {
    const response = await fetch(`/api/ai-assistant/conversations/${conversationId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    // Redirect to application confirmation
    window.location.href = `/applications/${data.applicationId}`;
  }

  return (
    <div className="ai-chat">
      <div className="progress-bar">
        <div style={{ width: `${completion}%` }} />
      </div>

      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
      </div>

      <div className="input-area">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type your response..."
          disabled={loading}
        />
        <button onClick={sendMessage} disabled={loading}>
          Send
        </button>
        {completion >= 100 && (
          <button onClick={submit} className="submit-btn">
            Submit Application
          </button>
        )}
      </div>
    </div>
  );
}
*/