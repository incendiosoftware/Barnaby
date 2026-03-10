const content = `Hello <think>this is a thought</think> world <thought>another
multiline
thought</thought> and some unclosed <think>streaming thought`;

const thoughtRegex = /<(?:think|thought)>([\s\S]*?)(?:<\/(?:think|thought)>|$)/gi;
let match;
let lastIndex = 0;

while ((match = thoughtRegex.exec(content)) !== null) {
  const prefix = content.slice(lastIndex, match.index).trim();
  if (prefix) {
    console.log("PREFIX:", prefix);
  }
  const thoughtContent = match[1].trim();
  if (thoughtContent) {
    console.log("THOUGHT:", thoughtContent);
  }
  lastIndex = thoughtRegex.lastIndex;
}
const suffix = content.slice(lastIndex).trim();
if (suffix) {
  console.log("SUFFIX:", suffix);
}
