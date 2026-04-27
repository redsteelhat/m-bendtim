import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { ReportOzetResponse } from "../types";
import { formatQtyInteger } from "../formatQty";
import styles from "./dataPage.module.css";
import repStyles from "./RaporlarPage.module.css";

function tarihlerMetni(dates: string[] | undefined): string {
  if (!dates?.length) return "—";
  return dates.join(", ");
}

export function RaporlarPage() {
  const [data, setData] = useState<ReportOzetResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      setData(await api<ReportOzetResponse>("/api/reports/range"));
    } catch (e) {
      setData(null);
      setLoadError(e instanceof Error ? e.message : "Rapor alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className={styles.head}>
        <h1 className={styles.h1}>Raporlar</h1>
      </div>
      <p className="muted" style={{ margin: "0 0 1.25rem", maxWidth: "48rem" }}>
        Mal kabulde girilen tüm malzemeler (işlem tarihlerine göre özetlenir) ile sevk edilmiş
        stok satırları. Malzeme özetinde her kod için geçen irsaliye tarihleri listelenir.
      </p>

      {loading && <p className="muted">Yükleniyor…</p>}
      {loadError && <p className={styles.banner}>{loadError}</p>}

      {data && !loadError ? (
        <>
          <dl className={repStyles.summary}>
            <div className={repStyles.summaryCard}>
              <dt>Mal kabul satırı</dt>
              <dd>{data.ozet.malKabulSatirSayisi}</dd>
            </div>
            <div className={repStyles.summaryCard}>
              <dt>Mal kabul toplam adet</dt>
              <dd>{formatQtyInteger(data.ozet.malKabulToplamAdet)}</dd>
            </div>
            <div className={repStyles.summaryCard}>
              <dt>Sevk satırı</dt>
              <dd>{data.ozet.sevkSatirSayisi}</dd>
            </div>
            <div className={repStyles.summaryCard}>
              <dt>Sevk toplam adet</dt>
              <dd>{formatQtyInteger(data.ozet.sevkToplamAdet)}</dd>
            </div>
          </dl>

          <section className={repStyles.section} aria-labelledby="rep-mk">
            <h2 id="rep-mk" className={repStyles.sectionTitle}>
              Mal kabul
            </h2>
            <p className={repStyles.sectionLead}>
              Aynı malzeme kodundan gelen girişler tek satırda toplanır; işlem tarihleri mal
              kabulde girilen değerlerdir. Ayrıntılar için aşağıdaki satır detayına bakın.
            </p>
            {data.malKabulMalzemeOzeti.length === 0 ? (
              <p className="muted">Mal kabul kaydı yok.</p>
            ) : (
              <>
                <h3 className={repStyles.subTitle}>Malzeme özeti</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Malzeme kodu</th>
                        <th>İşlem tarihleri</th>
                        <th>Toplam adet</th>
                        <th>Satır sayısı</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.malKabulMalzemeOzeti.map((r) => (
                        <tr key={r.materialCode}>
                          <td>{r.materialCode}</td>
                          <td>{tarihlerMetni(r.irsaliyeTarihleri)}</td>
                          <td>{formatQtyInteger(r.toplamMiktar)}</td>
                          <td>{r.satirSayisi}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3 className={repStyles.subTitle}>Satır detayı</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>İşlem tarihi</th>
                        <th>İrsaliye no</th>
                        <th>Malzeme kodu</th>
                        <th>Ürün adı</th>
                        <th>Adet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.malKabul.map((r) => (
                        <tr key={r.id}>
                          <td>{r.irsaliyeTarihi?.slice(0, 10) ?? "—"}</td>
                          <td>{r.irsaliyeNo}</td>
                          <td>{r.materialCode}</td>
                          <td>{(r.materialDescription ?? "").trim() || "—"}</td>
                          <td>{formatQtyInteger(r.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className={repStyles.section} aria-labelledby="rep-sevk">
            <h2 id="rep-sevk" className={repStyles.sectionTitle}>
              Sevk edilen malzemeler
            </h2>
            <p className={repStyles.sectionLead}>
              Stokta «Tamamlandı» ve sevk işaretlenmiş tüm satırlar; tarih, sevk işleminin
              yapıldığı gündür (otomatik).
            </p>
            {data.sevkMalzemeOzeti.length === 0 ? (
              <p className="muted">Sevk edilmiş satır yok.</p>
            ) : (
              <>
                <h3 className={repStyles.subTitle}>Malzeme kodu özeti</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Malzeme kodu</th>
                        <th>Toplam adet</th>
                        <th>Sevk satırı</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sevkMalzemeOzeti.map((r) => (
                        <tr key={r.sku}>
                          <td>{r.sku}</td>
                          <td>{formatQtyInteger(r.toplamMiktar)}</td>
                          <td>{r.satirSayisi}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3 className={repStyles.subTitle}>Satır detayı</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Sevk tarihi</th>
                        <th>Malzeme kodu</th>
                        <th>Ürün adı</th>
                        <th>Miktar</th>
                        <th>Makina</th>
                        <th>Nereye</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sevkEdilen.map((r) => (
                        <tr key={r.id}>
                          <td>{r.shippedAt?.slice(0, 10) ?? "—"}</td>
                          <td>{r.sku}</td>
                          <td>{r.name}</td>
                          <td>
                            {formatQtyInteger(r.quantity)} {r.unit}
                          </td>
                          <td>
                            {r.machine ? `${r.machine.code} — ${r.machine.name}` : "—"}
                          </td>
                          <td>{r.shipDestination?.trim() || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
