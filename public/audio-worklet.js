class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._silenceThreshold = 0.005; // RMS threshold for silence detection
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];

      // Quick RMS check to skip truly silent frames
      let sumSq = 0;
      for (let i = 0; i < channelData.length; i++) {
        sumSq += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(sumSq / channelData.length);

      if (rms > this._silenceThreshold) {
        // Copy the data before posting (transferable buffers get neutered)
        const copy = new Float32Array(channelData);
        this.port.postMessage(copy);
      }
    }
    return true; // Keep processor alive
  }
}

registerProcessor('audio-processor', AudioProcessor);
