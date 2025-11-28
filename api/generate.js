// Vercel Serverless Function (Node.js)

// Vercel 환경에서는 @google/genai를 사용할 수 없으므로, 직접 fetch API를 사용합니다.
// 이 코드는 Vercel 서버에서 실행되며, process.env.GEMINI_API_KEY에 접근할 수 있습니다.

// Vercel은 'process.env.환경변수명'으로 서버 환경 변수에 접근할 수 있습니다.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// 프록시 서버의 메인 핸들러 함수
export default async function handler(req, res) {
  // 클라이언트에서 POST 요청을 보냈는지 확인
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // API 키가 Vercel 환경 변수에 설정되었는지 확인
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY is not set.' });
  }

  try {
    // 클라이언트에서 보낸 데이터 (base64Image와 prompt)를 JSON 본문에서 추출
    const { base64Image, prompt } = req.body;

    if (!base64Image || !prompt) {
      return res.status(400).json({ error: 'Missing required parameters: base64Image and prompt.' });
    }

    // Google Gemini API 호출을 위한 URL
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${GEMINI_API_KEY}`;

    // 이미지 생성 요청 본문 (Payload) 구성
    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'image/jpeg', // 클라이언트에서 JPEG로 리사이징하여 보냄
              data: base64Image
            }
          }
        ]
      }],
      generationConfig: { 
        responseModalities: ["IMAGE"] 
      }
    };

    // Google API 호출
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const apiResult = await apiResponse.json();

    // API 에러 처리 (Quota Exceeded, Invalid Key 등)
    if (!apiResponse.ok || apiResult.error) {
      console.error("Gemini API Error:", apiResult.error);
      let errorMessage = '이미지 생성 서버 오류';
      
      // 유출 키 에러나 할당량 초과 에러는 사용자 친화적인 메시지로 대체
      if (apiResult.error?.message?.includes("API key was reported as leaked") || apiResult.error?.message?.includes("exceeded your current quota")) {
          errorMessage = 'API 오류: 일시적인 문제이거나 사용량이 초과되었습니다. 잠시 후 다시 시도해주세요.';
      }

      return res.status(apiResponse.status || 500).json({ 
        error: errorMessage,
        originalStatus: apiResponse.status 
      });
    }

    // 성공적으로 이미지 데이터를 추출
    const generatedPart = apiResult.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (generatedPart) {
      const base64Data = generatedPart.inlineData.data;
      // 클라이언트에게 Base64 데이터만 전송
      return res.status(200).json({ data: base64Data });
    }

    return res.status(500).json({ error: 'Failed to extract generated image data.' });

  } catch (error) {
    console.error('Proxy Server Error:', error);
    return res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
}
