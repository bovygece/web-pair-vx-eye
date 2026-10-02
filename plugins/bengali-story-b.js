import { Module } from "../lib/plugins.js";
import { groupOnly, pickNewStory, storyReply } from "./bengali-story-utils.js";

const STORIES = [
  "😂 রুবেল বলল, ‘আজ থেকে আমি খুব disciplined।’ পাঁচ মিনিট পর সে ঘুমিয়ে পড়ল। বন্ধু জিজ্ঞেস করল, ‘তোর discipline কোথায়?’ রুবেল চোখ না খুলেই বলল, ‘ঘুমের সময় ঘুমানো—এটাই discipline!’",
  "🤣 শিক্ষক জিজ্ঞেস করলেন, ‘বাড়ির কাজ কোথায়?’ ছাত্র বলল, ‘স্যার, বাড়িতেই আছে।’ শিক্ষক বললেন, ‘তাহলে আনোনি কেন?’ ছাত্র বলল, ‘কারণ আপনি তো বাড়ির কাজই চেয়েছিলেন, স্কুলের কাজ নয়!’",
  "😄 এক বন্ধু আরেক বন্ধুকে বলল, ‘আমি আজ থেকে diet করছি।’ সঙ্গে সঙ্গে সে চা, বিস্কুট আর বিরিয়ানি অর্ডার করল। সবাই অবাক। সে বলল, ‘Diet কাল থেকে শুরু হবে—আজ farewell!’",
  "😂 গ্রুপে একজন লিখল, ‘কেউ কি জেগে আছ?’ সবাই silent। এক মিনিট পর admin লিখল, ‘হ্যাঁ।’ সঙ্গে সঙ্গে ২০ জন reply দিল—‘আমরাও!’ সবাই আসলে admin-এর reply-এর অপেক্ষায় ছিল।",
  "🤣 একজন বলল, ‘আমি খুব lucky।’ বন্ধু বলল, ‘কীভাবে?’ সে বলল, ‘ফোনের battery ১% ছিল, তবু ৩০ মিনিট ভিডিও দেখেছি।’",
];

Module({
  command: "b",
  aliases: ["মজারগল্প", "হাসিরগল্প", "কৌতুকগল্প", "ফানগল্প"],
  package: "bengali-stories",
  description: "প্রতি বার নতুন বাংলা মজার গল্প",
  usage: ".b",
})(async (message) => {
  if (!(await groupOnly(message))) return;
  const story = pickNewStory(message, STORIES);
  await message.send(storyReply("মজার গল্প", story, "মজার গল্প বাংলা"));
});
