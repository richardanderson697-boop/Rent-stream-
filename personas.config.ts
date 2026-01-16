const personaConfig = {
  apartment: {
    intro: "I'll help you join our community!",
    focus: "amenities and parking",
    customQuestions: ["Do you require a parking permit?"]
  },
  single_family: {
    intro: "I'll help you apply for this beautiful home.",
    focus: "maintenance and utilities",
    customQuestions: ["Are you comfortable handling basic yard care?"]
  },
  condo: {
    intro: "I'll guide you through the owner and HOA approval process.",
    focus: "HOA compliance",
    customQuestions: ["Have you reviewed the building's CC&R documents?"]
  }
};

// Use this in your startConversation function
const config = personaConfig[propertyType] || personaConfig.apartment;
