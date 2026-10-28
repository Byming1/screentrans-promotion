"""Tạo tài khoản ScreenTrans từ danh sách sinh viên trong file .xlsx.

Gọi trực tiếp Supabase signup với cùng tham số mà backend dùng (full_name
trong metadata, redirect_to về /auth/confirm). Không đi qua backend vì
registerLimiter chỉ cho 5 lần/giờ mỗi IP.

Mỗi tài khoản nhận một mật khẩu ngẫu nhiên, ghi ra CSV để tra lại.

    python -I scripts/seed_users.py <file.xlsx> <so_luong> [--dry-run]
"""

import csv
import json
import secrets
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from read_xlsx import rows  # noqa: E402

NAME_COL = 3
EMAIL_COL = 4
CLASS_COL = 0
PROJECT_COL = 7

DELAY_SECONDS = 8
PASSWORD_BYTES = 12


def load_env(path):
    env = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


def pick_students(xlsx_path, limit):
    seen = set()
    out = []
    for i, row in enumerate(rows(xlsx_path)):
        if i == 0 or len(row) <= EMAIL_COL:
            continue
        name = row[NAME_COL].strip()
        email = row[EMAIL_COL].strip().lower()
        if "@" not in email or not name or email in seen:
            continue
        seen.add(email)
        out.append(
            {
                "full_name": name,
                "email": email,
                "class": row[CLASS_COL].strip(),
                "project": row[PROJECT_COL].strip() if len(row) > PROJECT_COL else "",
            }
        )
        if len(out) >= limit:
            break
    return out


def signup(base_url, api_key, student, password, redirect_to):
    query = urllib.parse.urlencode({"redirect_to": redirect_to})
    url = f"{base_url}/auth/v1/signup?{query}"
    body = json.dumps(
        {
            "email": student["email"],
            "password": password,
            "data": {"full_name": student["full_name"]},
        }
    ).encode()

    req = urllib.request.Request(
        url,
        data=body,
        headers={"apikey": api_key, "Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(
            req, timeout=30, context=ssl.create_default_context()
        ) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read() or b"{}")
    except Exception as err:  # noqa: BLE001
        return 0, {"msg": str(err)}


def main():
    xlsx_path = sys.argv[1]
    limit = int(sys.argv[2])
    dry_run = "--dry-run" in sys.argv

    env = load_env(Path(__file__).parent.parent / "backend" / ".env")
    base_url = env["SUPABASE_URL"].rstrip("/")
    api_key = env["SUPABASE_PUBLISHABLE_KEY"]
    redirect_to = env.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    redirect_to += "/auth/confirm"

    students = pick_students(xlsx_path, limit)
    print(f"Đã chọn {len(students)} sinh viên")

    if dry_run:
        for i, s in enumerate(students, 1):
            print(f"  {i:2d}. {s['full_name']:28s} {s['email']}")
        print("\n--dry-run: không gọi API, không gửi mail.")
        return

    out_path = Path(__file__).parent / "seeded-users.csv"

    # Quota gửi mail của Supabase thường chặn giữa đường, nên bỏ qua các email
    # đã tạo thành công để chạy lại chỉ xử lý phần còn thiếu.
    done = set()
    if out_path.exists():
        with out_path.open(encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                if row.get("status") == "created":
                    done.add(row["email"])

    pending = [s for s in students if s["email"] not in done]
    print(f"Đã tạo trước đó: {len(done)} | Còn lại: {len(pending)}")

    if not pending:
        print("Không còn gì để tạo.")
        return

    created, failed = 0, 0
    is_new = not out_path.exists()

    with out_path.open("a", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        if is_new:
            writer.writerow(
                ["full_name", "email", "password", "class", "status", "detail"]
            )

        for i, s in enumerate(pending, 1):
            password = secrets.token_urlsafe(PASSWORD_BYTES)
            status, payload = signup(base_url, api_key, s, password, redirect_to)

            if status == 200 and payload.get("id"):
                created += 1
                state, detail = "created", payload["id"]
            else:
                failed += 1
                state = "failed"
                detail = payload.get("msg") or payload.get("error_description") or str(status)

            writer.writerow(
                [s["full_name"], s["email"], password, s["class"], state, detail]
            )
            fh.flush()
            print(f"  {i:2d}/{len(pending)} [{status}] {s['email']} -> {state} {detail[:60]}")

            # Hết quota thì dừng ngay: các lần gọi sau cũng chỉ nhận 429.
            if payload.get("error_code") == "over_email_send_rate_limit":
                print("\nSupabase đã hết quota gửi mail. Dừng lại.")
                print("Chạy lại script sau khi quota hồi để tiếp tục.")
                break

            if i < len(pending):
                time.sleep(DELAY_SECONDS)

    print(f"\nTạo thành công: {created} | Thất bại: {failed}")
    print(f"Mật khẩu đã lưu: {out_path}")


if __name__ == "__main__":
    main()
