const sendMessage = async () => {
  if (!input.trim() || loading) return;

  const userMessage = input.trim();
  setInput('');
  setLoading(true);
  
  // 1. Add User Message immediately
  setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);

  try {
    const response = await fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ message: userMessage, listingId })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantMessage = "";

    // 2. Process the stream
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      
      // Assume backend sends: data: {"message": "...", "extracted": {...}, "progress": 45}
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));
      
      for (const line of lines) {
        const jsonStr = line.replace('data: ', '');
        try {
          const data = JSON.parse(jsonStr);
          
          // 3. Update Text Content in Real-time
          assistantMessage = data.message;
          
          // 4. Update Application State
          setCompletion(data.progress);
          setExtractedData(data.extracted);
          setCanSubmit(data.canSubmit);
          
          // Update the last message in the list
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg.role === 'assistant') {
              const updated = [...prev];
              updated[updated.length - 1] = { ...lastMsg, content: assistantMessage };
              return updated;
            }
            return [...prev, { role: 'assistant', content: assistantMessage, timestamp: new Date() }];
          });
        } catch (e) {
          console.error("Error parsing stream chunk", e);
        }
      }
    }
  } catch (error) {
    // Handle error...
  } finally {
    setLoading(false);
  }
};
