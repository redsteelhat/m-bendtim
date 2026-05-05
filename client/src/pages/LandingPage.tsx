import { Link } from "react-router-dom";
import styles from "./LandingPage.module.css";

const features = [
  {
    title: "Mal kabulden sevke tek akış",
    text: "Gelen ürünleri, stok durumunu ve sevk hazırlığını aynı operasyon diliyle takip edin.",
  },
  {
    title: "Makina ve stok görünürlüğü",
    text: "Üretim sahasındaki makina kayıtlarını ve stok hareketlerini hızlı karar alacak netlikte izleyin.",
  },
  {
    title: "Yönetim için sade raporlar",
    text: "Günlük iş yükünü, bekleyen işleri ve tamamlanan hareketleri anlaşılır özetlerle okuyun.",
  },
];

const metrics = [
  { value: "5", label: "ana operasyon modülü" },
  { value: "24/7", label: "web tabanlı erişim" },
  { value: "Role", label: "yetkiye göre görünüm" },
];

export function LandingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand} aria-label="M-BEND T.İ.M ana sayfa">
          <span className={styles.brandMark} />
          <span>M-BEND T.İ.M</span>
        </Link>
        <nav className={styles.nav} aria-label="Ana menü">
          <a href="#ozellikler">Özellikler</a>
          <a href="#surec">Süreç</a>
          <Link to="/login" className={styles.navButton}>
            Giriş yap
          </Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Stok, sevk ve üretim takip paneli</p>
          <h1>Operasyonunuzu sade, ölçülebilir ve tek ekranda yönetin.</h1>
          <p className={styles.lead}>
            M-BEND T.İ.M; mal kabul, stok, sevk, makina ve raporlama süreçlerini
            saha ekipleri için net, yöneticiler için okunabilir hale getirir.
          </p>
          <div className={styles.actions}>
            <Link to="/login" className={styles.primaryAction}>
              Panele giriş yap
            </Link>
            <a href="#ozellikler" className={styles.secondaryAction}>
              Detayları incele
            </a>
          </div>
        </div>
        <div className={styles.heroVisual} aria-hidden="true">
          <img src="/assets/landing-hero.png" alt="" />
        </div>
      </section>

      <section className={styles.metrics} aria-label="Öne çıkan bilgiler">
        {metrics.map((metric) => (
          <div key={metric.label} className={styles.metricItem}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </div>
        ))}
      </section>

      <section id="ozellikler" className={styles.section}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Özellikler</p>
          <h2>Günlük operasyon için gereksiz kalabalıktan arındırılmış yapı.</h2>
        </div>
        <div className={styles.featureGrid}>
          {features.map((feature) => (
            <article key={feature.title} className={styles.featureCard}>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="surec" className={styles.process}>
        <div>
          <p className={styles.eyebrow}>Süreç</p>
          <h2>Kaydı girin, durumu izleyin, raporu alın.</h2>
        </div>
        <ol className={styles.steps}>
          <li>
            <span>01</span>
            <strong>Mal kabul</strong>
            <p>İrsaliye, malzeme ve miktar bilgileri düzenli şekilde kaydedilir.</p>
          </li>
          <li>
            <span>02</span>
            <strong>Stok ve makina</strong>
            <p>Ürün durumları ve makina kayıtları güncel operasyon verisiyle takip edilir.</p>
          </li>
          <li>
            <span>03</span>
            <strong>Sevk ve rapor</strong>
            <p>Sevk bekleyen işler ve tamamlanan hareketler yönetim ekranına yansır.</p>
          </li>
        </ol>
      </section>
    </main>
  );
}
