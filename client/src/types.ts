export type UserRole = "admin" | "operator" | "viewer";
export type Permission =
  | "users.manage"
  | "machines.write"
  | "stock.write"
  | "malKabul.write"
  | "shipments.write";

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

/** Makinaya atanmış stok satırlarına göre API hesaplar (GET /api/machines). */
export type MakinaStokDurumu = "atama_yok" | "tamamlandi" | "devam_ediyor";

export interface Machine {
  id: number;
  /** Makina kodu */
  code: string;
  /** Makina seri no (API alanı: `name`) */
  name: string;
  /** Bu makinaya atanmış stok satırı sayısı */
  stokAtananSatir?: number;
  /** Bunlardan «Tamamlandı» durumundakiler */
  stokTamamlananSatir?: number;
  /** Tüm atananlar tamamlandıysa `tamamlandi` */
  makinaStokDurumu?: MakinaStokDurumu;
  createdAt?: string;
  updatedAt?: string;
}

export type StockProcessStatus = "bekliyor" | "isleniyor" | "tamamlandi";

export interface StockItem {
  id: number;
  /** Malzeme kodu (API ve veritabanı alanı adı: `sku`) */
  sku: string;
  name: string;
  quantity: string | number;
  unit: string;
  machineId: number | null;
  goodsReceiptLineId?: number | null;
  trackingCode?: string | null;
  processStatus: StockProcessStatus;
  isShipped: boolean;
  shippedAt: string | null;
  /** Sevk ekranında girilen hedef (nereye); API `shipDestination` */
  shipDestination?: string | null;
  machine?: { id: number; code: string; name: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

export type StockMovementType =
  | "mal_kabul"
  | "mal_kabul_iptal"
  | "manual_create"
  | "manual_update"
  | "bulk_update"
  | "machine_assignment"
  | "status_change"
  | "ship"
  | "unship"
  | "ship_destination";

export interface StockMovement {
  id: number;
  stockItemId: number | null;
  actorUserId: number | null;
  type: StockMovementType;
  sku: string;
  name: string | null;
  quantityBefore: string | number | null;
  quantityAfter: string | number | null;
  quantityDelta: string | number;
  machineIdBefore: number | null;
  machineIdAfter: number | null;
  processStatusBefore: StockProcessStatus | null;
  processStatusAfter: StockProcessStatus | null;
  isShippedBefore: boolean | null;
  isShippedAfter: boolean | null;
  shipDestinationBefore: string | null;
  shipDestinationAfter: string | null;
  actorUser?: Pick<User, "id" | "name" | "email" | "role"> | null;
  machineBefore?: { id: number; code?: string; name?: string } | null;
  machineAfter?: { id: number; code?: string; name?: string } | null;
  createdAt: string;
}

/** Mal kabul satırı; stok (makinasız) miktarını artırır. */
export interface MalKabulLine {
  id: number;
  irsaliyeNo: string;
  /** Kayıt / işlem günü (YYYY-MM-DD) */
  irsaliyeTarihi: string;
  materialCode: string;
  /** Mal kabulde girilen ürün adı (API/DB: `materialDescription`) */
  materialDescription?: string;
  quantity: string | number;
  createdAt?: string;
  updatedAt?: string;
}

/** POST /api/mal-kabul/batch yanıtı */
export interface MalKabulBatchResponse {
  lines: MalKabulLine[];
}

/** GET /api/reports/range — tüm mal kabul ve sevk edilmiş stok özeti */
export interface ReportMalzemeOzet {
  toplamMiktar: number;
  satirSayisi: number;
}

export interface ReportMalKabulMalzemeOzet extends ReportMalzemeOzet {
  materialCode: string;
  /** Mal kabuldeki benzersiz işlem tarihleri (YYYY-MM-DD, artan) */
  irsaliyeTarihleri: string[];
}

export interface ReportSevkMalzemeOzet extends ReportMalzemeOzet {
  sku: string;
}

export interface ReportOzetResponse {
  malKabul: MalKabulLine[];
  malKabulMalzemeOzeti: ReportMalKabulMalzemeOzet[];
  sevkEdilen: Array<{
    id: number;
    sku: string;
    name: string;
    quantity: string | number;
    unit: string;
    shippedAt: string;
    shipDestination: string | null;
    machine: { id: number; code: string; name: string } | null;
  }>;
  sevkMalzemeOzeti: ReportSevkMalzemeOzet[];
  ozet: {
    malKabulSatirSayisi: number;
    malKabulToplamAdet: number;
    sevkSatirSayisi: number;
    sevkToplamAdet: number;
  };
}

export interface DashboardSummary {
  stock: {
    total: number;
    bekliyor: number;
    isleniyor: number;
    tamamlandi: number;
  };
  sevk: {
    bekleyen: number;
    edildi: number;
  };
  machines: { total: number };
  recentMalKabul: Array<{
    id: number;
    irsaliyeNo: string;
    irsaliyeTarihi: string;
    materialCode: string;
    /** Eski kayıtlarda dolu olabilir */
    materialDescription?: string;
    quantity: string | number;
    createdAt?: string;
  }>;
}

export type ShipmentStatus = "hazirlik" | "yolda" | "teslim" | "iptal";

export interface Shipment {
  id: number;
  documentNo: string;
  shippedAt: string;
  destination: string;
  notes: string | null;
  status: ShipmentStatus;
  createdAt?: string;
  updatedAt?: string;
}
