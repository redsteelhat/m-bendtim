import { describe, expect, it } from "vitest";
import { IrsaliyePdfParseError, parseIrsaliyeText } from "../services/irsaliyePdfParser";

const sampleText = `
İrsaliye No: MBN2026000000475
İrsaliye Tarihi: 04-05-2026

Sıra No Malzeme Kodu Malzeme Açıklaması Açıklama Miktar
1 30.02.00.03468-OP1 C1050 Ø35x156mm 4,0 Adet
2 30.02.00.03726-OP1 C1050 Ø45x120mm 1,5 Adet
3 30.02.00.00222-OP1 C 1050 Ø45*55mm 1,0 Adet
--- page break ---
24 30.02.00.03517-OP1 Transmisyon Mili Ø60x25mm 1,0 Adet
25 30.02.00.01459-OP1 TRANSMİSYON MİL Ø60*25mm 2,0 Adet
28 30.02.00.00237-OP1 SOĞUK ÇEKME LAMA 60*30*200mm 2,0 Adet
`;

describe("parseIrsaliyeText", () => {
  it("extracts document number and date", () => {
    const parsed = parseIrsaliyeText(sampleText);
    expect(parsed.documentNo).toBe("MBN2026000000475");
    expect(parsed.documentDate).toBe("2026-05-04");
  });

  it("parses decimal comma quantities and row names with spaces", () => {
    const parsed = parseIrsaliyeText(sampleText);
    expect(parsed.lines[1]).toMatchObject({
      rowNo: 2,
      sku: "30.02.00.03726-OP1",
      name: "C1050 Ø45x120mm",
      quantity: 1.5,
      unit: "Adet",
    });
    expect(parsed.lines[2].name).toBe("C 1050 Ø45*55mm");
  });

  it("preserves Turkish characters and parses rows across page breaks", () => {
    const parsed = parseIrsaliyeText(sampleText);
    expect(parsed.lineCount).toBe(6);
    expect(parsed.lines[5]).toMatchObject({
      rowNo: 28,
      name: "SOĞUK ÇEKME LAMA 60*30*200mm",
      quantity: 2,
    });
  });

  it("parses rows when PDF text splits columns across multiple lines", () => {
    const parsed = parseIrsaliyeText(`
İrsaliye No: MBN2026000000475
İrsaliye Tarihi: 04-05-2026
Sıra No Malzeme Kodu Malzeme Açıklaması Açıklama Miktar
1
30.02.00.03468-OP1
C1050 Ø35x156mm
4,0
Adet
2
30.02.00.03794-OP1
C1050 Ø45x205mm
2,0
Adet
`);
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0]).toMatchObject({
      rowNo: 1,
      sku: "30.02.00.03468-OP1",
      name: "C1050 Ø35x156mm",
      quantity: 4,
      unit: "Adet",
    });
  });

  it("normalizes spaced e-irsaliye text from pdf extraction", () => {
    const parsed = parseIrsaliyeText(`
İrsaliye No: \tMB N 2026000000475
İrsaliye Tarihi: \t04-05-2026
Sıra No \tMalzeme Kodu \tMalzeme Açıklaması \tAçıklama \tMiktar
1 \t3 0 .02.00.03468-O P1 \tC 1050 Ø35x156m m \t4 ,0 Adet
23 \t3 0 .02.00.03516-O P1 \tTran sm isy on Mili Ø60x25mm \t1 ,0 Adet
28 \t3 0 .02.00.00237-O P1 \tSOĞUK ÇEK ME LAMA 60*30*200mm \t2 ,0 Adet
`);
    expect(parsed.documentNo).toBe("MBN2026000000475");
    expect(parsed.lines).toHaveLength(3);
    expect(parsed.lines[0]).toMatchObject({
      sku: "30.02.00.03468-OP1",
      name: "C 1050 Ø35x156mm",
      quantity: 4,
    });
    expect(parsed.lines[1].name).toBe("Transmisyon Mili Ø60x25mm");
    expect(parsed.lines[2].name).toBe("SOĞUK ÇEKME LAMA 60*30*200mm");
  });

  it("rejects missing document number", () => {
    expect(() => parseIrsaliyeText(sampleText.replace(/İrsaliye No:.+/, ""))).toThrow(
      IrsaliyePdfParseError
    );
  });

  it("rejects empty line list", () => {
    expect(() =>
      parseIrsaliyeText("İrsaliye No: MBN2026000000475\nİrsaliye Tarihi: 04-05-2026")
    ).toThrow(IrsaliyePdfParseError);
  });
});
