import { describe, it, expect } from "vitest";
import {
  normalizeTeamName,
  stageToPhase,
  matchKey,
  mapExternalRows,
  buildPhaseLookup,
  findUnmatchedExternal,
  buildAliasMap,
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

describe('buildPhaseLookup precedencia', () => {
  it('fase valida vence sobre null anterior na mesma chave', () => {
    const lookup = buildPhaseLookup(mapExternalRows([
      { name: 'Foo', stage: 'desconhecido' },
      { name: 'Foo', stage: 'slc' },
    ]))
    expect(lookup.get(matchKey('Foo')).key).toBe('slc')
  })
})

describe("buildAliasMap", () => {
  it("normaliza os dois lados e ignora pares incompletos", () => {
    const m = buildAliasMap([
      { external: "Revisa.Ai", hackia: "Revisai" },
      { external: "  ", hackia: "X" },
      { external: "Y", hackia: "" },
    ]);
    expect(m).toEqual({ revisaai: "revisai" });
  });
  it("ultimo par vence em colisao de chave normalizada", () => {
    const m = buildAliasMap([
      { external: "On.Ai", hackia: "AAA" },
      { external: "on ai", hackia: "BBB" },
    ]);
    expect(m.onai).toBe("bbb");
  });
});

describe("matchKey com aliasMap", () => {
  it("usa o aliasMap passado", () => {
    const m = buildAliasMap([{ external: "Revisa.Ai", hackia: "Revisai" }]);
    expect(matchKey("Revisa.Ai", m)).toBe("revisai");
  });
  it("sem aliasMap usa o default do config (compat)", () => {
    expect(matchKey("byAItas")).toBe("baitas");
  });
});

describe("override dinamico de apelido", () => {
  const rows = [{ name: "Revisa.Ai", stage: "slc" }];
  it("com override, Revisa.Ai casa com Revisai e some das orfas", () => {
    const m = buildAliasMap([{ external: "Revisa.Ai", hackia: "Revisai" }]);
    const ext = mapExternalRows(rows, m);
    const lookup = buildPhaseLookup(ext);
    expect(lookup.get(matchKey("Revisai", m)).key).toBe("slc");
    expect(findUnmatchedExternal(["Revisai"], ext, m)).toEqual([]);
  });
  it("sem override, Revisa.Ai continua orfa", () => {
    const ext = mapExternalRows(rows);
    expect(findUnmatchedExternal(["Revisai"], ext)).toEqual(["Revisa.Ai"]);
  });
});
