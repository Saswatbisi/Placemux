const KNOWN_SKILLS = [
  "React",
  "Node.js",
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Kubernetes",
  "Docker",
  "MongoDB",
  "Postgres",
  "HTML",
  "CSS",
  "AWS",
  "Java",
  "C++",
  "Ruby",
  "PHP",
  "Express",
  "Fastify",
  "SQL",
  "NoSQL",
  "Git",
  "GraphQL",
];

export class ParserService {
  parseText(text, isJd = false) {
    if (!text) {
      return [];
    }

    const defaultLevel = isJd ? 70 : 80;
    const results = [];

    for (const skill of KNOWN_SKILLS) {
      // Escape all regex special characters like . in Node.js and + in C++
      const escapedSkill = skill.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      const regex = new RegExp(`\\b${escapedSkill}\\b`, "i");
      const match = regex.exec(text);

      if (match) {
        const skillIndex = match.index;
        const skillLen = match[0].length;

        // Extract the sentence containing this skill to avoid overlapping context with other skills
        let start = 0;
        for (let i = skillIndex - 1; i >= 0; i--) {
          if (
            (text[i] === "." || text[i] === "!" || text[i] === "?") &&
            (i + 1 === text.length || /\s/.test(text[i + 1]))
          ) {
            start = i + 1;
            break;
          }
        }

        let end = text.length;
        for (let i = skillIndex + skillLen; i < text.length; i++) {
          if (text[i] === "." || text[i] === "!" || text[i] === "?") {
            if (i + 1 === text.length || /\s/.test(text[i + 1])) {
              end = i + 1;
              break;
            }
          }
        }

        const sentenceText = text.substring(start, end);
        const relSkillIndex = skillIndex - start;
        const candidates = [];

        // Helper to check if number is part of "X years of experience" or "Y months"
        const isExpPeriod = (numStr, index) => {
          const afterText = sentenceText
            .substring(index + numStr.length)
            .trim();
          return /^(?:year|yr|month|mo)s?\b/i.test(afterText);
        };

        // 1. Look for percentage format (e.g., 85% or 85 %)
        const percentRegex = /\b(\d{1,3})\s*%/g;
        let pMatch;
        while ((pMatch = percentRegex.exec(sentenceText)) !== null) {
          const val = parseInt(pMatch[1], 10);
          if (val >= 1 && val <= 100) {
            candidates.push({
              val,
              dist: Math.abs(pMatch.index - relSkillIndex),
              priority: 1,
            });
          }
        }

        // 2. Look for phrase: "level 80", "lvl: 70", "score of 90", "minimum 60"
        const phraseRegex =
          /(?:level|lvl|score|minimum|min)\s*:?\s*(\d{1,3})/gi;
        let phMatch;
        while ((phMatch = phraseRegex.exec(sentenceText)) !== null) {
          const val = parseInt(phMatch[1], 10);
          if (val >= 1 && val <= 100) {
            if (
              !isExpPeriod(
                phMatch[1],
                phMatch.index + phMatch[0].indexOf(phMatch[1]),
              )
            ) {
              candidates.push({
                val,
                dist: Math.abs(phMatch.index - relSkillIndex),
                priority: 2,
              });
            }
          }
        }

        // 3. Look for any standalone number in the window
        const numberRegex = /\b(\d{1,3})\b/g;
        let numMatch;
        while ((numMatch = numberRegex.exec(sentenceText)) !== null) {
          const val = parseInt(numMatch[1], 10);
          if (val >= 1 && val <= 100) {
            if (!isExpPeriod(numMatch[1], numMatch.index)) {
              candidates.push({
                val,
                dist: Math.abs(numMatch.index - relSkillIndex),
                priority: 3,
              });
            }
          }
        }

        let level = defaultLevel;
        if (candidates.length > 0) {
          // Sort by proximity first, then by priority (explicit forms preferred)
          candidates.sort((a, b) => {
            if (a.dist !== b.dist) {
              return a.dist - b.dist;
            }
            return a.priority - b.priority;
          });
          level = candidates[0].val;
        }

        results.push({
          skill,
          level,
        });
      }
    }

    return results;
  }

  parseResume(text) {
    const parsed = this.parseText(text, false);
    return {
      skills: parsed.map((s) => ({
        skill: s.skill,
        level: s.level,
      })),
    };
  }

  parseJd(text) {
    const parsed = this.parseText(text, true);
    return {
      skillThresholds: parsed.map((s) => ({
        skill: s.skill,
        minimumLevel: s.level,
      })),
    };
  }
}
