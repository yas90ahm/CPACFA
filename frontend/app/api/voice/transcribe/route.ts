import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/voice/transcribe
 * Accepts multipart/form-data with an "audio" file (webm, mp3, etc.).
 * If OPENAI_API_KEY is set, uses OpenAI Whisper API to transcribe.
 * Returns { text: string } or { error: string }.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('audio') as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing or invalid "audio" file in form data.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Whisper transcription unavailable: OPENAI_API_KEY not configured.' },
        { status: 503 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const blob = new Blob([buffer], { type: file.type || 'audio/webm' });
    const whisperForm = new FormData();
    whisperForm.append('file', blob, file.name || 'audio.webm');
    whisperForm.append('model', 'whisper-1');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: `Whisper API error: ${res.status} ${err}` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { text?: string };
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    return NextResponse.json({ text });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Transcription failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
