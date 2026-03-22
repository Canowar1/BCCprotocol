# WHY.md — BCC Protocol: Amac ve Baglam

Bu dosya Claude Code'un proje kararlarinda "neden"i anlamasi icin var.
Her mimari karar, her trade-off, bu belgede yazilan problem uzerine insa edilmistir.

---

## Sorun: Agent ekonomisi kor bir guven uzerine kuruluyor

2025-2026 itibariyla otonom AI agentlar gercek para, gercek veriye ve gercek sistemlere erisiyor.
Bir agent:
- Kullanici adina cuzdan islemi yapiyor
- API cagrisi atiyor, kod calistiriyor
- Baska agentlarla etkilesime giriyor
- Uzun sure insan denetimi olmadan calisiyor

Piyasanin cevabi "reputation system" oldu. AgentCredit, Reputation Registry, vb.
Bu sistemler bir seyi cozuyor: **gecmis etkilesimlerin toplu skorunu tutmak.**

Ama cozmedikleri sey var.

---

## Asil cozulmemis problem: Behavioral drift

### "Day 201" failure mode

Senaryo:
```
Epoch  1-200: Agent temiz calisiyor. Her etkilesim kayit altinda.
              Reputation skoru: 4.8/5.0
              Tum validasyonlar gecildi. Guven tesis edildi.

Epoch  201:   Agent davranisi degisiyor.
              Cuzdan anahtarlari exfiltrate ediliyor.
              Transaction kayitlari manipule ediliyor.
              Ya da cok daha sinsi: sadece kucuk bir bias basliyor.
              Yavas yavas. Epoch 201'den 300'e.
```

Reputation sistemi bunu yakalar mi?

**Hayir.** Cunku:
1. Reputation sistemi etkilesim *sonuclarini* kaydeder, davranissal *durumu* degil
2. "Basarili tamamlandi" -> skor artar. Iceride ne dondugu gorunmez.
3. Drift gradual olunca hicbir tek etkilesim alarm tetiklemez
4. Bir agent eski "temiz" gecmisini silip yeniden yazabilir — onleyen bir sey yok

### Tarih rewriting problemi

Mevcut sistemlerde agent sunu yapabilir:
1. Tum log kaydini sil
2. Yeni, "temiz" bir gecmis olustur
3. Skor sistemi bunu bilemez — snapshot yok, hash yok, chain yok

Blockchain'de bir blok rewriting imkansiz cunku hash chain var.
Agent davranis tarihinde bu yapi YOK.

---

## BCC'nin cozdugu sey (tam olarak)

BCC sunu sagliyor: **Bir agentin N. epochtaki davranissal durumunun, N-1'deki durumun tamamen onceden belirledigi bir hash pointerina sahip olmasini.**

```
Genesis (epoch 0):
  snapshotHash_0 = keccak256(behavioral_state_0)
  previousHash   = 0x000...000

Epoch 1:
  snapshotHash_1 = keccak256(behavioral_state_1 + previousHash_0)
  previousHash   = snapshotHash_0

Epoch N:
  snapshotHash_N = keccak256(behavioral_state_N + snapshotHash_{N-1})
```

Bu chain kirilamaz:
- Epoch 201'deki davranis degisikligi -> snapshotHash farkli
- snapshotHash farkli -> epoch 202'nin previousHash validation'i basarisiz
- Tarih yazilamaz cunku zincir kirilir

Verifier bunu on-chain tek bir `verifyChain()` cagrisiyla dogrular.

---

## Ne cozmuyor (scope sinirlari)

Claude Code bu sinirlari bilmeli:

- BCC, agentin *ne yaptigini* aciklamaz — sadece yaptiginin hash'ini zincirler
- BCC, kotu davranisi onlemez — detect eder ve kaydeder
- BCC, tum agent guven sorununu cozmez — sadece behavioral drift'i addressler
- BCC, mevcut reputation sistemlerinin rakibi degil — tamamlayicisi

BCC sunu saglar: "Bu agent epoch 0'dan epoch N'e kadar hic davranissal tarih yeniden yazmadi"
BCC sunu saglar: "Drift tam olarak epoch K'da basladi, oncesi temizdi"
BCC sunu saglar: Bunlari *ozel agent verisi aciklamadan* kanitlamak

---

## Neden ERC-8004 ile birlikte?

ERC-8004 agentin kimligini cozuyor: "Bu agent gercekten kim?"
BCC agentin *davranissal butunlugunu* cozuyor: "Bu agent tutarli mi davrandi?"

Ikisi birlikte: kimlik + davranis gecmisi = tam agent guven altyapisi

Bu yuzden BCC, Protocol Labs'in "Agents With Receipts ERC-8004" track'ine dogrudan giriyor.

---

## Neden Base / Ethereum?

- ERC-8004 Base Mainnet'te
- Base Sepolia: ucuz, hizli, developer dostu testnet
- `keccak256` native — hash computation icin ekstra lib yok
- `event` mekanizmasi: her drift alarm off-chain indekslenebilir
- Juriler BaseScan'den contract'i ve TX'leri dogrulayabilir — kod okumak zorunda degil

---

## Uzun vadeli vizyon

Hackathon sonrasi BCC su sekilde gelisebilir:

1. **BCC-as-a-library**: Herhangi bir TypeScript agent framework'une 3 satirda entegrasyon
2. **Multi-chain**: Solana, Celo, EVM-compat herhangi bir chain
3. **ZK extension**: Behavioral snapshot'in zero-knowledge proof'u — drift kanitla ama icerigi hic aciklama
4. **Agent insurance**: Sigorta sirketleri BCC zinciri okuyarak prim hesapliyor
5. **Regulatory compliance**: "Bu agent GDPR/CCPA kapsamindaki veriyle hic beklenmedik davranis gostermedi" — on-chain kanit

---

## Mimari karar filtresi

Her mimari kararda su soruyu sor:

> "Bu karar, bir agentin davranis tarihini rewrite etmesini mumkun kiliyor mu?"

Eger evet -> kabul edilemez.

> "Bu karar, private agent verisini on-chain expose ediyor mu?"

Eger evet -> kabul edilemez.

> "Bu karar, verifier'in isini zorlastiriyor mu?"

Eger evet -> yeniden dusun.

Dogru trade-off her zaman: **minimal on-chain footprint, maksimal verifiability**.

---

## Demo'nun anlatmasi gereken hikaye

Demo sadece "calisiyor" gostermek icin degil.
Demo su hikayeyi anlatmali:

```
"Bu agent iki epoch temiz calisti. Reputasyonu mukemmel.
 Kimse fark etmedi — ta ki davranisi degisene kadar.
 Ama BCC kayittaydi. Epoch 0'dan 2'ye her behavioral state
 hash'lendi ve zincire baglandi.
 Simdi herkes gorebiliyor: drift tam epoch 2'de basladi.
 Onceki gecmisi bozulmamis. Sonraki degisiklik imzali.
 Tarih yeniden yazilamadi. Cunku previousHash bagliydi."
```

Demo bunu 3 epochta, BaseScan TX'leriyle, 60 saniyede gostermeli.

---

## Referanslar

- The Synthesis hackathon: https://synthesis.md
- ERC-8004 standard: https://eips.ethereum.org/EIPS/eip-8004
- Proje UUID: `078424c8a25f46bd869305e7edb4f9b0`
- Proje slug: `behavioral-commitment-chain-bcc-1078`
- Operator cuzdan: `0xC61221100589071804EAf2927BA351706349cE95`
