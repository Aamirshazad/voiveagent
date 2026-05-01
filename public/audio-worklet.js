class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      // Send the Float32Array channel data back to the main thread
      this.port.postMessage(channelData);
    }
    return true; // Keep processor alive
  }
}

registerProcessor('audio-processor', AudioProcessor);
