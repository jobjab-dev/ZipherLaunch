“marketplace for sealed-bid Dutch auctions” ที่ใครก็มา “ขายเหรียญตัวเอง” ได้ โดยใช้ USDC เป็นเงินตั้งต้น และ refund กลับเป็น ERC-7984 (confidential USDC)

ด้านล่างคือสเปก/สถาปัตยกรรมที่ทำได้จริงและ “เหมือนแนว Zama” มากสุด: price public + quantity private, มี 4 เฟส, ใช้ FHE + async decryption ตอนสรุปผล 
Zama
+2
Zama Documentation
+2

1) โฟลว์ทั้งระบบ (ให้เหมือน Zama แต่ “ใครก็ขายได้”)
เฟส A — Shield USDC

ผู้ใช้ฝาก USDC เข้า wrapper → ได้ confidential USDC (ERC-7984) ไว้ในกระเป๋าตัวเอง 
Zama
+1

หลัง shield แล้ว “ยอด/จำนวนโอน” เป็นความลับ (ciphertext handles) 
OpenZeppelin Docs
+1

เฟส B — Place bids

1 bid = ราคา (public) + จำนวน (encrypted)

ส่ง bid ได้หลายอัน / ยกเลิกได้ก่อนปิด (cancel) เหมือนที่ประกาศ 
Zama

จำนวนส่งเข้า contract ด้วย “encrypted inputs + proof” (ใช้ fromExternal) 
Zama Documentation
+1

เงินจ่ายเข้าประมูลเป็น confidential USDC (ERC-7984) ผ่าน confidentialTransferFrom 
GitHub
+1

เฟส C — Clearing price & allocation

ปิดประมูลแล้วค่อยคำนวณ “เติมจากราคาสูง→ต่ำ” เพื่อหา clearing price 
Zama

เปิดเผยแค่ผลจำเป็นด้วย async decryption (requestDecryption + callback verify signatures) 
Zama Documentation
+1

เฟส D — Claim (Refund เป็น 7984 ตามที่คุณต้องการ)

ผู้ใช้กด claim แล้ว:

ได้เหรียญของโปรเจกต์ (ปกติเป็น ERC-20 → public ตอนโอน)

refund คืนเป็น ERC-7984 (confidential USDC) 
Zama
+1

2) สัญญาที่ต้องมี (3 ตัวหลัก)
(1) USDCShieldWrapper (USDC → cUSDC ERC-7984)

ใช้ OpenZeppelin Confidential Contracts / ERC-7984 เป็นฐาน ไม่ต้องเขียนมาตรฐานเอง 
OpenZeppelin Docs
+1

(2) AuctionFactory

ให้ “ผู้ขาย” สร้าง auction ใหม่ได้เอง

เก็บ registry: รายการ auction ทั้งหมด, metadata, สถานะ

createAuction params แนะนำ

tokenSold (ERC20 address)

seller

lotsForSale (uint64)

lotSize (uint256) ← ทำให้ quantity เป็น “จำนวนล็อต” (แก้ปัญหา decimals)

startTime, endTime

tickSizeMicroUSDC (default 5000 = $0.005)

minTick, maxTick (บังคับ range กัน gas ระเบิด)

“lotSize” สำคัญมาก: ถ้าเหรียญขายมี 18 decimals → lotSize=1e18 แล้ว qtyEnc คือ “จำนวนเหรียญเต็ม ๆ” (integer) จะคำนวณง่ายสุด

(3) SealedDutchAuction

รับ bid, เก็บ escrow cUSDC, finalize, claim/refund

3) ดีไซน์ bid ให้ “ทำจริงได้” และไม่พังเรื่อง update/cancel

ผมแนะนำ “1 bid = 1 record” (เหมือน order)

update ราคา/จำนวน = cancel bid เดิม + สร้าง bid ใหม่ (UX เหมือนเดิม)

โครงสร้าง

struct Bid {
  address bidder;
  uint32  tick;        // public price tick
  euint64 lotsEnc;     // private quantity in lots
  euint64 paidEnc;     // private paid amount in microUSDC
  bool    active;
  bool    claimed;
}


ตอน placeBid(tick, encryptedLots, proof):

lotsEnc = FHE.fromExternal(encryptedLots, proof) 
Zama Documentation
+1

paidEnc = lotsEnc * (tick * tickSizeMicroUSDC) (คูณด้วย public scalar)

cUSDC.confidentialTransferFrom(msg.sender, address(this), paidEnc) 
GitHub

เก็บ bidId ไว้ให้ cancel/claim ทีหลัง

ตอน cancelBid(bidId):

mark inactive

คืน paidEnc กลับไปเป็น cUSDC (refund ยัง private)

4) Finalize: หา clearing price แบบ “เหมือน Zama” (เปิดผลน้อยที่สุด)

ตอนจบคุณต้องใช้ public decryption แบบ async เพื่อเปิดเผยผลที่จำเป็น (เช่น clearingTick, totalAtClearing, soldLots) 
Zama Documentation
+1

แนวทางที่เวิร์กสำหรับ marketplace:

สรุป “ยอด demand ต่อ tick” เป็น totalLotsEnc[tick] = Σ lotsEnc

วิ่งจาก tick สูง→ต่ำ สร้าง cumulative แบบ encrypted

สร้าง clearingTickEnc (encrypted) แล้วค่อย requestDecryption เพื่อเปิดเป็นเลขเดียว 
Zama Documentation
+1

ถ้าคุณปล่อยให้ maxTick-minTick กว้างเกินไป ค่า gas จะโหดมาก — ต้องบังคับ range และ tick size ตั้งแต่ต้น

5) Claim logic (Refund = 7984 ตาม requirement)

หลัง finalize ได้ clearingTick แล้ว:

bid ต่ำกว่า clearing: refund เต็ม = paidEnc (ไม่ต้อง decrypt) → คืนเป็น cUSDC private ได้เลย

bid สูงกว่า clearing:

allocation = ต้องโอน ERC20 → ต้องรู้จำนวน plaintext สุดท้าย (จะ public อยู่ดีตอนโอน)

refund = (bidPrice - clearingPrice) * lotsEnc → ทำแบบ encrypted แล้วคืนเป็น cUSDC ได้

bid เท่ากับ clearing:

ถ้ามี pro-rata ต้องคำนวณ allocation (จะออกมาเป็น public ตอนโอน ERC20)

จุดสำคัญ: การ “เปิดจำนวน” จะเกิดแค่ตอน claim (เพราะ ERC20 โอนแล้วมัน public อยู่แล้ว) แต่ refund คุณยังเก็บเป็น 7984 private ได้

6) หน้าเว็บที่ควรมี (ให้เดโมดูเป็นของจริง)

Create Sale (Seller): ใส่ token, lotSize, lotsForSale, ช่วงเวลา, min/max tick

Shield USDC: approve + wrap ไป cUSDC 
Zama
+1

Place Bids: ใส่ราคา/จำนวน → client สร้าง encrypted input + proof แล้วส่ง 
Zama Documentation
+1

Auction Status: countdown + phase + เมื่อ finalize แล้วโชว์ clearing price

Claim: claim token + refund (refund เป็น cUSDC)

7) สรุป decision ที่ผม “ล็อกให้” ตามโจทย์คุณ

เงินประมูลหลัก: USDC

ผู้ใช้ต้อง shield เป็น cUSDC (ERC-7984) ก่อน bid 
Zama
+1

Refund: คืนเป็น ERC-7984 เท่านั้น (private)

ผู้ขายขายเหรียญตัวเอง: ฝาก ERC20 เข้า auction ตอน create

ใช้ sealed-bid Dutch: price public, quantity private, clearing price หลังจบ