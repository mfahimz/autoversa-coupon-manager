const fs = require('fs')
const path = require('path')

const sampleRate = 44100
const notes = [
    { freq: 523.25, time: 0.0,  duration: 0.45, gain: 0.38 }, // C5
    { freq: 659.25, time: 0.22, duration: 0.45, gain: 0.40 }, // E5
    { freq: 783.99, time: 0.44, duration: 0.50, gain: 0.45 }, // G5
    { freq: 1046.50, time: 0.68, duration: 0.60, gain: 0.50 }, // C6
    { freq: 1318.51, time: 0.95, duration: 0.75, gain: 0.52 }, // E6
]

const totalDuration = 1.8
const totalSamples = Math.floor(sampleRate * totalDuration)
const buffer = new Float32Array(totalSamples)

notes.forEach(({ freq, time, duration, gain: peakGain }) => {
    const startSample = Math.floor(time * sampleRate)
    const noteSamples = Math.floor(duration * sampleRate)
    const attackSamples = Math.floor(0.02 * sampleRate)

    for (let i = 0; i < noteSamples; i++) {
        const sampleIdx = startSample + i
        if (sampleIdx >= totalSamples) break

        let env = 0
        if (i < attackSamples) {
            env = (i / attackSamples) * peakGain
        } else {
            const decayProgress = (i - attackSamples) / (noteSamples - attackSamples)
            env = peakGain * Math.exp(-decayProgress * 5)
        }

        const t = i / sampleRate
        // Primary tone (sine)
        const primary = Math.sin(2 * Math.PI * freq * t)
        
        // Shimmer harmonic (triangle overtone, 2nd harmonic)
        const harmFreq = freq * 2
        const triPhase = (harmFreq * t) % 1
        const triangle = 4 * Math.abs(triPhase - 0.5) - 1
        const harmEnv = env * 0.28 * Math.max(0, 1 - (i / (noteSamples * 0.6)))

        buffer[sampleIdx] += primary * env + triangle * harmEnv
    }
})

// Normalize & write 16-bit PCM WAV
const numChannels = 1
const bytesPerSample = 2
const blockAlign = numChannels * bytesPerSample
const byteRate = sampleRate * blockAlign
const dataSize = totalSamples * bytesPerSample
const headerSize = 44
const totalSize = headerSize + dataSize

const out = Buffer.alloc(totalSize)

// RIFF header
out.write('RIFF', 0)
out.writeUInt32LE(totalSize - 8, 4)
out.write('WAVE', 8)

// fmt subchunk
out.write('fmt ', 12)
out.writeUInt32LE(16, 16) // Subchunk1Size (16 for PCM)
out.writeUInt16LE(1, 20) // AudioFormat (1 for PCM)
out.writeUInt16LE(numChannels, 22)
out.writeUInt32LE(sampleRate, 24)
out.writeUInt32LE(byteRate, 28)
out.writeUInt16LE(blockAlign, 32)
out.writeUInt16LE(16, 34) // BitsPerSample

// data subchunk
out.write('data', 36)
out.writeUInt32LE(dataSize, 40)

for (let i = 0; i < totalSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, buffer[i]))
    const intVal = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF
    out.writeInt16LE(Math.floor(intVal), 44 + i * 2)
}

const outputPath = path.join(__dirname, '../public/cooldown-alert-preview.wav')
fs.writeFileSync(outputPath, out)
console.log('Successfully generated:', outputPath)
