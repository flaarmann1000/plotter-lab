import { SampledSignal } from "../core/types";

export interface AudioMetadata {
  duration: number;
  sampleRate: number;
  channels: number;
}

export async function decodeAudioFile(file: File): Promise<SampledSignal> {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") {
    throw new Error("Audio decoding is only available in the browser.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext();
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const samples = new Float32Array(channelData.length);
    samples.set(channelData);

    return {
      samples,
      sampleRate: audioBuffer.sampleRate,
      duration: audioBuffer.duration,
      channels: audioBuffer.numberOfChannels,
    };
  } finally {
    await audioContext.close();
  }
}

