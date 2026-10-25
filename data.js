// data.js — the CONTENT of the app. To add or change a recitation style,
// edit only this file. The screen rebuilds itself from this list.

const RECITER = {
  arabic: "عبد الرشيد صوفي",
  english: "Sheikh Abdul Rashid Soufi",
};

// One object per recitation style. The order here is the order on screen.
// "server" is the folder on mp3quran.net where this style's audio files live.
const STYLES = [
  {
    id: 258,
    arabic: "حفص عن عاصم",
    english: "Hafs A’n Assem",
    type: "Murattal",
    surahs: 114,
    badge: "Most common",
    server: "https://cdn.mp3quran.net/audio/abdulrasheed-sufi/r3/",
  },
  {
    id: 65,
    arabic: "السوسي عن أبي عمرو",
    english: "Assosi A’n Abi Amr",
    type: "Murattal",
    surahs: 114,
    badge: "",
    server: "https://cdn.mp3quran.net/audio/abdulrasheed-sufi/r2/",
  },
  {
    id: 64,
    arabic: "خلف عن حمزة",
    english: "Khalaf A’n Hamzah",
    type: "Murattal",
    surahs: 114,
    badge: "",
    server: "https://cdn.mp3quran.net/audio/abdulrasheed-sufi/r1/",
  },
];
