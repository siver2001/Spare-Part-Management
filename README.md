# Spare Parts Warehouse Web App (Vercel – Free Tier)

**Tài liệu này chứa “MASTER PROMPT” cực kỳ chi tiết để bạn đưa cho AI agent (Cursor / Copilot / Devin / v.v.) triển khai đúng yêu cầu.**
Ngôn ngữ: **Tiếng Việt** (code comments có thể EN).

---

## 1) Bối cảnh & mục tiêu

Bạn cần một **phần mềm web quản lý kho spare parts cho bộ phận bảo trì**.Ứng dụng có:

- Trang **đăng nhập** và **phân quyền** (User thường / User cấp cao / Admin).
- Trang chính hiển thị **Sparepart List** (danh mục vật tư) với đầy đủ cột như hình.
- Chức năng **Finding / Search**: tìm theo **QR**, theo **tên**, **part number**, **bin location**, v.v.
- Từ kết quả tìm: có 3 nút thao tác: **Nhập kho**, **Xuất kho**, **Edit** (Edit chỉ user cấp cao trở lên).
- Trang **Transaction History** (lịch sử nhập/xuất): xem, lọc theo thời gian/keyword, và **tự động xóa cuốn chiếu dữ liệu quá 2 tháng**.
- Deploy lên **Vercel** và vận hành **miễn phí** (tối đa trong giới hạn free tier).

---

## 2) MASTER PROMPT (đưa nguyên khối này cho AI agent)

> **Vai trò:** Bạn là AI Agent Senior Full‑Stack Engineer.
> **Nhiệm vụ:** Tạo một ứng dụng web hoàn chỉnh theo yêu cầu dưới đây.
> **Ưu tiên:** Đúng yêu cầu nghiệp vụ + bảo mật + vận hành miễn phí trên Vercel.
> **Kết quả cần giao:** Repo chạy được (local + deploy), README hướng dẫn, migration DB, seed admin, và UI.

### 2.1 Tech stack bắt buộc (để chạy free trên Vercel)

Chọn stack theo tiêu chí **miễn phí, dễ deploy, ít phụ thuộc trả phí**:

1) **Frontend/Backend**:

- **Next.js (App Router) + TypeScript**
- UI: TailwindCSS + shadcn/ui (hoặc tương đương)
- API: Next.js Route Handlers (`/app/api/...`)

2) **Database (free tier, managed)**

- **Supabase Postgres (Free)** + Prisma ORM

3) **Auth & Roles** (bắt buộc có Admin quản lý tài khoản):

- Dùng **Credentials login** (username/password) lưu trong DB (hash bằng bcrypt/argon2).
- Không dùng email OTP để tránh phức tạp/chi phí.
- Session: **NextAuth** (Credentials Provider) hoặc tự làm session bằng JWT httpOnly cookie.
- Bắt buộc có **RBAC**: `USER`, `POWER_USER`, `ADMIN`.

4) **Không dùng Cron trả phí.**
   Yêu cầu “xóa lịch sử quá 2 tháng” phải làm theo cách **không cần scheduler**:

- Mỗi lần truy vấn/lưu transaction, backend tự chạy **cleanup lazy**: xóa bản ghi `createdAt < now - 60 days` trước khi trả kết quả (đảm bảo “cuốn chiếu”).
- Cho phép thêm 1 endpoint `/api/maintenance/cleanup` để chạy thủ công (ADMIN) nếu cần.

### 2.2 Phân quyền & quy tắc bảo mật (bắt buộc)

**Vai trò:**

- `USER` (user thường):
  - Được xem Sparepart List
  - Được search / scan QR
  - Được tạo phiếu **Nhập kho** / **Xuất kho**
  - **Không** được edit thông tin spare part (Part Name, Bin, Safety Stock, …)
  - **Không** quản lý user
- `POWER_USER` (user cấp cao):
  - Tất cả quyền của USER
  - **Được edit** thông tin spare part (nhưng không được xóa user)
- `ADMIN`:
  - Tất cả quyền của POWER_USER
  - **Quản lý tài khoản**: tạo/sửa/xóa user, đổi role

**Bảo mật:**

- Password phải hash (bcrypt/argon2). Không lưu plaintext.
- API protected bằng session/JWT.
- Validate input server-side (zod/yup).
- Audit fields: `createdBy`, `createdAt`, `updatedAt`, `updatedBy`.
- Chống thao tác âm kho (không cho xuất > tồn).

### 2.3 Mô hình dữ liệu (Database schema – bắt buộc)

Thiết kế bảng tối thiểu:

#### 2.3.1 `users`

- `id` (uuid)
- `username` (unique, required)
- `passwordHash` (required)
- `displayName` (required)
- `role` enum: `USER | POWER_USER | ADMIN`
- `isActive` boolean (default true)
- `createdAt`, `updatedAt`

#### 2.3.2 `spare_parts`

Các cột đúng theo “Sparepart list”:

- `id` (uuid)
- `no` (int) – số thứ tự hiển thị (có thể auto increment hoặc do admin/power set)
- `partName` (string, required)
- `partNumber` (string, unique/optional tùy bạn; nếu có nên unique)
- `description` (text)
- `binLocation` (string)
- `currentStockOk` (int, default 0)
- `currentStockDamaged` (int, default 0)
- `safetyStockOk` (int, default 0)  // chỉ OK part
- `maxStock` (int, default 0)
- `reorderQuantity` (int, default 0)
- `leadTimeDays` (int, default 0) // hoặc string nếu muốn “2 weeks”
- `qrCodeValue` (string, unique) // giá trị QR để scan ra part
- `isActive` boolean (default true)
- `createdAt`, `updatedAt`, `updatedBy`

#### 2.3.3 `transactions`

Lưu lịch sử nhập/xuất (tự xóa quá 2 tháng):

- `id` (uuid)
- `orderNo` (string, unique) // auto generate
- `type` enum: `IN | OUT`
- `partId` (fk -> spare_parts.id)
- `partCondition` enum: `OK | DAMAGED`
- `quantity` (int, >0)
- `reason` (text, optional)
- `workOrderNo` (string, optional) // cho OUT (nếu có)
- `inspectorName` (string, optional) // cho IN
- `performedByUserId` (fk -> users.id) // tự gán theo user login
- `performedByDisplayNameSnapshot` (string) // snapshot tên lúc tạo
- `performedAt` (datetime) // thời gian nhập/xuất (default now)
- `createdAt` (datetime, default now)

> Gợi ý: transaction nên giữ snapshot `performedByDisplayNameSnapshot` để hiển thị lịch sử ổn định khi user đổi tên.

### 2.4 Logic nghiệp vụ kho (bắt buộc đúng)

#### 2.4.1 Nhập kho (IN)

Form nhập kho gồm:

- Part (đến từ Finding hoặc chọn từ list)
- `partCondition`: OK hoặc DAMAGED
- `quantity`
- `performedBy`: tự gán user đăng nhập (không cho sửa)
- `inspectorName`: tùy chọn
- `reason`: tùy chọn (nhưng khuyến khích required)
- `orderNo`: tự generate

Khi submit:

- Tạo transaction type=IN
- Cộng tồn kho tương ứng:
  - Nếu OK: `currentStockOk += quantity`
  - Nếu Damaged: `currentStockDamaged += quantity`

#### 2.4.2 Xuất kho (OUT)

Form xuất kho gồm:

- Part
- `partCondition`: OK hoặc DAMAGED
- `quantity`
- `performedBy`: tự gán user đăng nhập
- `workOrderNo`: tùy chọn (nếu có)
- `reason`: tùy chọn
- `orderNo`: tự generate
- `performedAt`: auto now (có thể cho edit nếu cần, nhưng mặc định là now)

Khi submit:

- Validate tồn kho đủ:
  - OK: `currentStockOk >= quantity`
  - Damaged: `currentStockDamaged >= quantity`
- Tạo transaction type=OUT
- Trừ tồn kho tương ứng:
  - OK: `currentStockOk -= quantity`
  - Damaged: `currentStockDamaged -= quantity`

#### 2.4.3 Order number auto-generate (bắt buộc)

Tạo mã order theo format dễ đọc, unique:

- Ví dụ: `SP-YYYYMMDD-XXXX` (XXXX là counter tăng dần mỗi ngày)Hoặc: `IN-YYYYMMDD-HHMMSS-<rand4>` / `OUT-...`Miễn sao:
- Unique
- Có thể phân biệt IN/OUT
- Dễ tra cứu

### 2.5 Tính năng UI/Pages (bắt buộc)

#### 2.5.1 Trang Login

- Username + Password
- Nếu sai hiển thị lỗi.
- Sau login chuyển về trang chính `/`.

#### 2.5.2 Trang chính – Sparepart List + Finding

Layout:

- Bảng Sparepart List với cột:
  1. NO.
  2. Part Name
  3. Part Number
  4. Description (Thông số kỹ thuật…)
  5. Bin Location
  6. Current Stock (2 cột con: OK / Damaged)
  7. Safety Stock (OK only)
  8. Max Stock
  9. Reorder Quantity
  10. Lead Time

Ở góc/side có khối **Finding (Search)**:

- Search input hỗ trợ:
  - gõ text (partName/partNumber/binLocation/qrCodeValue)
  - scan QR bằng camera (nếu user cho phép)
- Khi search -> hiển thị danh sách kết quả (có thể lọc ngay trên bảng chính).

Mỗi dòng spare part có 3 action buttons:

- **Nhập kho** (IN)
- **Xuất kho** (OUT)
- **Edit** (chỉ POWER_USER và ADMIN)

Edit spare part:

- Cho sửa các field trong Sparepart list và `qrCodeValue`.
- Không cho sửa trực tiếp stock bằng edit (stock chỉ thay đổi qua IN/OUT để có trace).
- Cho phép “Deactivate part” (isActive=false) thay vì xóa cứng.

#### 2.5.3 Trang Transaction History (lịch sử nhập/xuất)

Route gợi ý: `/transactions`

- Có 3 nút:
  - **Nhập kho**: chỉ hiển thị transactions type=IN
  - **Xuất kho**: chỉ hiển thị transactions type=OUT
  - **Tìm kiếm / Lọc**:
    - theo keyword (orderNo, partName, partNumber, binLocation, performedBy, reason, workOrderNo)
    - theo khoảng thời gian (from-to)
- Bảng hiển thị cột:
  - Order No
  - Type (IN/OUT)
  - Part (Name + Number)
  - Condition (OK/DAMAGED)
  - Quantity
  - Performed By
  - Inspector (IN)
  - Work Order No (OUT)
  - Reason
  - Performed At

**Data retention 2 tháng:**

- Khi gọi API list transactions, backend xóa các bản ghi quá 60 ngày rồi mới trả kết quả.

#### 2.5.4 Trang Admin – User Management

Route gợi ý: `/admin/users` (chỉ ADMIN)

- Danh sách user:
  - username, displayName, role, isActive, createdAt
- Tạo user mới (username, displayName, password, role)
- Reset password
- Đổi role
- Disable/Enable
- Xóa user (cân nhắc soft delete: isActive=false; tránh làm hỏng lịch sử)

### 2.6 API endpoints (gợi ý, agent có thể điều chỉnh)

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`

Spare parts:

- `GET /api/spare-parts?query=...`
- `POST /api/spare-parts` (POWER_USER/ADMIN)
- `PATCH /api/spare-parts/:id` (POWER_USER/ADMIN)
- `PATCH /api/spare-parts/:id/deactivate` (POWER_USER/ADMIN)

Transactions:

- `POST /api/transactions/in`
- `POST /api/transactions/out`
- `GET /api/transactions?type=IN|OUT&query=...&from=...&to=...`
- (Optional) `POST /api/maintenance/cleanup` (ADMIN) – chạy xóa lịch sử cũ

### 2.7 Ràng buộc miễn phí (bắt buộc)

- Deploy trên Vercel Hobby.
- DB dùng Supabase/Neon free.
- Không cần background cron trả phí. Dùng cleanup lazy.
- Không dùng service tốn tiền/giới hạn nặng.

### 2.8 Seed & tài khoản mặc định (bắt buộc)

Khi chạy local lần đầu:

- Có script seed tạo ADMIN mặc định:
  - username: `admin`
  - password: `admin123!` (hoặc đọc từ env `ADMIN_INITIAL_PASSWORD`)
  - role: `ADMIN`
- README phải hướng dẫn đổi password ngay.

### 2.9 Chất lượng & trải nghiệm

- UI responsive (desktop ưu tiên).
- Form có validation + thông báo lỗi.
- Có toast success/fail.
- Bảng có pagination (hoặc virtual scroll) nếu dữ liệu lớn.
- Search nhanh, debounce.
- QR scan: nếu không có camera thì cho nhập text QR.

### 2.10 Acceptance Criteria (điều kiện nghiệm thu)

Ứng dụng được xem là hoàn thành khi:

1) Login hoạt động, phân quyền đúng 3 role.
2) Admin quản lý user: tạo/sửa/xóa/đổi role.
3) Sparepart list hiển thị đúng cột + stock 2 cột OK/Damaged.
4) Search được theo QR / text.
5) Nhập kho/ xuất kho tạo transaction, tự gán user, tự tạo orderNo, cập nhật stock đúng và chặn âm kho.
6) POWER_USER/ADMIN edit được spare part; USER thì không.
7) Transaction History lọc IN/OUT và tìm theo keyword + time range.
8) Transactions quá 60 ngày bị xóa cuốn chiếu (verify bằng logic cleanup).
9) Deploy Vercel thành công, hướng dẫn env var rõ ràng.

---

## 3) Gợi ý UI (tham khảo)

- Header: tên app + user menu (role, logout)
- Sidebar: Spare Parts / Transactions / Admin (admin only)
- Main table: dùng DataTable component, hỗ trợ sort cơ bản.

---

## 4) Gợi ý vận hành “free”

- Nếu dùng Supabase/Neon free, lưu ý giới hạn sleep/connection.
- Dùng Prisma + connection pooling (Neon hỗ trợ).
- Với Supabase, có thể dùng connection string chuẩn + pgbouncer nếu cần (tùy agent).

---

## 5) Checklist triển khai cho AI agent (để không sót)

- [ ] Init Next.js TS + Tailwind + shadcn
- [ ] Prisma schema + migrations
- [ ] Auth (NextAuth credentials hoặc JWT cookie)
- [ ] RBAC middleware (server) + UI route guard
- [ ] CRUD spare parts (edit only)
- [ ] IN/OUT transactions + stock update atomic (transaction DB)
- [ ] Lazy cleanup transactions older than 60 days
- [ ] Admin user management
- [ ] QR scanning component + fallback manual
- [ ] Deploy guide for Vercel + env vars + seed admin

---

## 6) ENV VARS (ví dụ)

Agent phải mô tả và dùng:

- `DATABASE_URL=...`
- `AUTH_SECRET=...` (nếu NextAuth/JWT)
- `ADMIN_INITIAL_PASSWORD=...` (optional)

---

## 7) Ghi chú quan trọng

- Không cho phép chỉnh stock trực tiếp trong edit (tránh mất trace).
- Mọi thay đổi stock phải qua IN/OUT và tạo transaction.
- Khi xóa user: ưu tiên disable để không hỏng lịch sử.

---

**Kết thúc MASTER PROMPT.**
