# English Mastery - AI Language Learning Portal

Transform your English speaking skills with AI-powered real-time voice coaching!

## 🌟 Features

**6 Comprehensive Learning Modules:**

- 🗣️ **American Pronunciation** - Master clear American English sounds, stress, and intonation
- 💬 **Conversation Practice** - Engage in real-world scenarios and improve fluency
- 📚 **Grammar & Vocabulary** - Build vocabulary and master grammar rules interactively
- 💼 **Business English** - Professional communication for workplace success
- 🎯 **IELTS/TOEFL Prep** - Prepare for English proficiency speaking exams
- 🌍 **Accent Reduction** - Reduce your accent and sound more native

**Powered by Google Gemini AI:**
- Real-time voice interaction with Affective Dialog
- Instant pronunciation feedback
- Natural conversation flow
- Adaptive difficulty based on your level

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- Google Gemini API key

### Installation

1. **Clone or download this repository**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up your API key:**
   
   Create a `.env.local` file in the root directory:
   ```
   API_KEY=your_gemini_api_key_here
   ```
   
   Get your API key from: https://aistudio.google.com/app/apikey

4. **Run the app:**
   ```bash
   npm run dev
   ```

5. **Open your browser:**
   
   Navigate to `http://localhost:5173` (or the URL shown in terminal)

## 🎙️ How to Use

1. **Select a Learning Module** from the sidebar (Pronunciation, Conversation, etc.)
2. **Click "Start Learning"** to begin your session
3. **Allow microphone access** when prompted
4. **Speak naturally** - the AI coach will listen and respond
5. **Get instant feedback** on pronunciation, grammar, and fluency
6. **Practice regularly** to track your improvement!

## 🔧 Tech Stack

- **Frontend:** React 19 + TypeScript
- **Styling:** Tailwind CSS
- **AI Model:** Google Gemini 2.5 Flash (Native Audio)
- **Build Tool:** Vite
- **Audio Processing:** Web Audio API (16kHz input, 24kHz output)

## 📚 Learning Modules Details

### Pronunciation Training
Focus on vowel quality, consonant clarity, word stress, and intonation patterns. The AI coach models correct pronunciation and provides immediate corrective feedback.

### Conversation Practice
Engage in real-world scenarios like ordering food, job interviews, travel, and small talk. The AI adapts to your fluency level and keeps conversations natural.

### Grammar & Vocabulary
Interactive grammar drills and vocabulary expansion. The AI corrects errors in real-time and explains rules conversationally.

### Business English
Professional communication coaching for presentations, meetings, and networking. Focus on formal register and business idioms.

### Test Preparation
IELTS/TOEFL speaking coach that simulates exam questions and provides scoring feedback based on official criteria.

### Accent Reduction
Specialized coaching for neutralizing non-native accents. Works on American R sounds, TH sounds, vowel distinctions, and rhythm.

## 🎯 Best Practices

- **Use headphones** for best audio quality
- **Speak clearly** at a normal pace
- **Practice daily** for 15-30 minutes
- **Try different modules** to diversify your skills
- **Don't be afraid to make mistakes** - that's how you learn!

## 🔐 Privacy

All voice processing happens in real-time. No audio is stored permanently. Transcriptions are kept in memory only during your session.

## 🆘 Troubleshooting

**Microphone not working?**
- Check browser permissions (usually shows in address bar)
- Ensure microphone is not used by another application

**Connection issues?**
- Verify your API key is set correctly in `.env.local`
- Check your internet connection
- Try refreshing the page

**Audio quality issues?**
- Use headphones to prevent echo
- Ensure quiet environment
- Speak closer to microphone

## 📄 License

This project is open source and available for educational purposes.

## 🌐 Deploy

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

---

**Start your English mastery journey today! 🚀**

Made with ❤️ using Google Gemini AI
