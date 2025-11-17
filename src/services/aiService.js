const fetch = globalThis.fetch || require('node-fetch');


const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';


const callGemini = async (prompt, maxTokens = 200) => {
  try {

    const response = await fetch(
      `${GEMINI_BASE_URL}/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.3,
          }
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Invalid response format from Gemini API');
    }

    return data.candidates[0].content.parts[0].text.trim();

  } catch (error) {
    console.error('Gemini API call error:', error);
    throw new Error(`Gemini API request failed: ${error.message}`);
  }
};

/**
 * Summarize note content using Gemini
 */
const summarizeContent = async (content) => {
  try {
    const truncatedContent = content.length > 4000
      ? content.substring(0, 4000) + '...'
      : content;

    const prompt = `Summarize the following notes concisely, highlighting key points and action items:\n\n${truncatedContent}`;

    return await callGemini(prompt, 300);

  } catch (error) {
    console.error('Gemini Summarization error:', error);
    throw new Error('Failed to generate summary using Gemini API.');
  }
};

/**
 * Suggest tags for note content using Gemini
 */
const suggestTags = async (content) => {
  try {
    const truncatedContent = content.length > 3000
      ? content.substring(0, 3000) + '...'
      : content;

    const prompt = `Suggest 3-5 relevant tags for this content. Return ONLY a JSON array format like ["tag1","tag2","tag3"] without any additional text or explanation:\n\n${truncatedContent}`;

    const tagsString = await callGemini(prompt, 150);

    // Extract JSON array from response
    try {
      const jsonMatch = tagsString.match(/\[.*\]/);
      if (jsonMatch) {
        const tags = JSON.parse(jsonMatch[0]);
        return Array.isArray(tags) ? tags.slice(0, 5) : [];
      }
      return [];
    } catch (parseError) {
      console.warn('Gemini returned non-JSON response for tags:', tagsString);
      return [];
    }

  } catch (error) {
    console.error('Gemini Tag suggestion error:', error);
    return [];
  }
};

/**
 * Enhance note content (grammar, structure) using Gemini
 */
const enhanceContent = async (content) => {
  try {
    const prompt = `Improve the grammar, clarity and structure of this text while preserving the original meaning and tone:\n\n${content}`;

    return await callGemini(prompt, 500);

  } catch (error) {
    console.error('Gemini Content enhancement error:', error);
    throw new Error('Failed to enhance content using Gemini API');
  }
};

/**
 * Extract action items from meeting notes using Gemini
 */
const extractActionItems = async (content) => {
  try {
    // More specific prompt
    const prompt = `Extract specific, actionable tasks from these meeting notes. 
Return ONLY a valid JSON array of strings like ["task 1", "task 2"]. 
Each item should be a clear action item. Atleast try to provide the Actions items in a best possible way \n\n${content}`;

    const actionsString = await callGemini(prompt, 300);

    // Clean the response first
    const cleanedResponse = actionsString.trim();

    // More robust JSON extraction
    try {
      // Try multiple approaches to find JSON
      let jsonArray;

      //  Direct JSON parse
      try {
        jsonArray = JSON.parse(cleanedResponse);
      } catch (e) {
        //  Extract with regex
        const jsonMatch = cleanedResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          jsonArray = JSON.parse(jsonMatch[0]);
        } else {
          //  Manual cleanup and parse
          const sanitized = cleanedResponse
            .replace(/(\w)'(?=\w)/g, '$1') // Fix unescaped quotes
            .replace(/,\s*]/g, ']'); // Remove trailing commas

          jsonArray = JSON.parse(sanitized);
        }
      }

      // Validate the result
      if (Array.isArray(jsonArray)) {
        // Filter out any non-string items and empty strings
        return jsonArray
          .filter(item => typeof item === 'string' && item.trim().length > 0)
          .map(item => item.trim());
      }

      return [];

    } catch (parseError) {
      console.warn('Failed to parse Gemini actions response:', {
        response: actionsString,
        error: parseError.message
      });
      return [];
    }

  } catch (error) {
    console.error('Gemini Action extraction error:', error);
    return [];
  }
};

/**
 * Health check - verify Gemini API is accessible
 */
const checkGeminiHealth = async () => {
  try {
    const testPrompt = "Respond with just 'OK' if you're working.";
    const response = await callGemini(testPrompt, 10);

    return {
      healthy: true,
      provider: 'Gemini API',
      model: 'gemini-2.0-flash',
      responseTime: 'fast ⚡'
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      provider: 'Gemini API'
    };
  }
};

module.exports = {
  summarizeContent,
  suggestTags,
  enhanceContent,
  extractActionItems,
  checkOllamaHealth: checkGeminiHealth,
};