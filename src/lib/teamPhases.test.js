import { describe, it, expect } from "vitest";
import {
  normalizeTeamName,
  stageToPhase,
  matchKey,
  mapExternalRows,
  buildPhaseLookup,
  findUnmatchedExternal,
} from "./teamPhases";

describe("normalizeTeamName", () => {
  it("remove acentos, emoji, espaços e pontuação; minúsculas", () => {
    expect(normalizeTeamName("Odonto Guard 🦷✨")).toBe("odontoguard");
    expect(normalizeTeamName("Combinado não sai caro")).toBe(
      "combinadonaosaicaro",
    );
    expect(normalizeTeamName("On.Ai")).toBe("onai");
    expect(normalizeTeamName("  ALLias ")).toBe("allias");
  });
  it("lida com vazio/nulo", () => {
    expect(normalizeTeamName("")).toBe("");
    expect(normalizeTeamName(null)).toBe("");
    expect(normalizeTeamName(undefined)).toBe("");
  });
});

describe("stageToPhase", () => {
  it("mapeia stage direto", () => {
    expect(stageToPhase("slc")).toMatchObject({
      key: "slc",
      order: 2,
      label: "SLC-IA",
    });
    expect(stageToPhase("equipe")).toMatchObject({ key: "equipe", order: 0 });
    expect(stageToPhase("hero")).toMatchObject({ key: "hero", order: 6 });
  });
  it("aplica aliases", () => {
    expect(stageToPhase("ideia").key).toBe("equipe");
    expect(stageToPhase("mvp").key).toBe("slc");
    expect(stageToPhase("prototipo").key).toBe("slc");
    expect(stageToPhase("solucao").key).toBe("slc");
    expect(stageToPhase("codigo").key).toBe("pivotar");
    expect(stageToPhase("vendas").key).toBe("venda");
  });
  it("é tolerante a caixa/espaços e devolve null no desconhecido", () => {
    expect(stageToPhase("  SLC ").key).toBe("slc");
    expect(stageToPhase("xyz")).toBeNull();
    expect(stageToPhase(null)).toBeNull();
    expect(stageToPhase("")).toBeNull();
  });
});

describe("matchKey", () => {
  it("casa pares problemáticos via alias", () => {
    expect(matchKey("byAItas")).toBe("baitas");
    expect(matchKey("bAItas")).toBe("baitas");
    expect(matchKey("EasyAI IT Company")).toBe("easyiaitcompany");
    expect(matchKey("EasyIA IT Company")).toBe("easyiaitcompany");
  });
  it("para nomes normais é só a normalização", () => {
    expect(matchKey("On.AI")).toBe("onai");
    expect(matchKey("On.Ai")).toBe("onai");
  });
});

describe("lookup + getPhase (via buildPhaseLookup)", () => {
  const rows = [
    { name: "byAItas", stage: "slc" },
    { name: "On.Ai", stage: "problema" },
    { name: "EasyAI IT Company", stage: "pitch" },
  ];
  it("resolve a fase a partir do nome HackIA", () => {
    const lookup = buildPhaseLookup(mapExternalRows(rows));
    expect(lookup.get(matchKey("bAItas")).key).toBe("slc");
    expect(lookup.get(matchKey("On.AI")).key).toBe("problema");
    expect(lookup.get(matchKey("EasyIA IT Company")).key).toBe("pitch");
    expect(lookup.get(matchKey("MindRift"))).toBeUndefined();
  });
});

describe("findUnmatchedExternal", () => {
  it("lista equipes externas sem par no HackIA", () => {
    const hackiaNames = ["bAItas", "On.AI", "EasyIA IT Company"];
    const external = mapExternalRows([
      { name: "byAItas", stage: "slc" },
      { name: "On.Ai", stage: "slc" },
      { name: "EasyAI IT Company", stage: "slc" },
      { name: "Revisa.Ai", stage: "slc" },
    ]);
    expect(findUnmatchedExternal(hackiaNames, external)).toEqual(["Revisa.Ai"]);
  });
});
