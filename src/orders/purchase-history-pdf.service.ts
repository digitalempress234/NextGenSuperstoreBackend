import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RED = '#FF1B25';
const ORANGE = '#FF7414';
const GOLD = '#FFB900';
const INK = '#171414';
const CREAM = '#FFF8EE';
const MUTED = '#6B625F';
const BORDER = '#F2DFCA';

export interface PurchaseHistoryPdfItem {
  orderNumber: string;
  purchasedAt: Date;
  storeName: string;
  productName: string;
  productCode?: string | null;
  quantity: number;
  itemTotal: string;
  currency: string;
  paymentStatus: string;
  orderStatus: string;
}

export interface PurchaseHistoryPdfData {
  customerName: string;
  customerEmail: string;
  fromLabel: string;
  toLabel: string;
  orderCount: number;
  itemCount: number;
  totalValue: string;
  currency: string;
  generatedAt: Date;
  items: PurchaseHistoryPdfItem[];
}

@Injectable()
export class PurchaseHistoryPdfService {
  private readonly appName: string;
  private readonly supportEmail?: string;
  private readonly logoPath: string;
  private cachedLogo: Buffer | null | undefined;

  constructor(config: ConfigService) {
    this.appName = config.get<string>('APP_NAME', 'OhoO!');
    this.supportEmail = config.get<string>('RECEIPT_SUPPORT_EMAIL') || undefined;
    this.logoPath = join(__dirname, '..', 'branding', 'assets', 'ohoo-logo.png');
  }

  async render(statement: PurchaseHistoryPdfData): Promise<Buffer> {
    const document = new PDFDocument({
      size: 'A4',
      margins: { top: 42, right: 48, bottom: 64, left: 48 },
      info: {
        Title: `${this.appName} purchase history`,
        Author: this.appName,
        Subject: `Purchase history for ${statement.customerEmail}`,
      },
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    const complete = new Promise<Buffer>((resolve, reject) => {
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });

    this.drawHeader(document, statement);
    this.drawSummary(document, statement);
    this.drawTable(document, statement);
    this.drawFooters(document, statement);
    document.end();
    return complete;
  }

  private drawHeader(document: PDFKit.PDFDocument, statement: PurchaseHistoryPdfData) {
    const top = 34;
    document.roundedRect(36, top, 523, 94, 18).fill(CREAM);
    const logo = this.getLogo();
    if (logo) {
      document.image(logo, 50, top + 18, {
        cover: [145, 58],
        align: 'center',
        valign: 'center',
      });
    } else {
      document
        .font('Helvetica-Bold')
        .fontSize(23)
        .fillColor(RED)
        .text(this.appName, 52, top + 34);
    }
    document
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor(INK)
      .text('PURCHASE HISTORY', 270, top + 26, { width: 265, align: 'right' });
    document
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(`Generated ${this.dateTime(statement.generatedAt)}`, 270, top + 56, {
        width: 265,
        align: 'right',
      });
    document.y = top + 116;
  }

  private drawSummary(document: PDFKit.PDFDocument, statement: PurchaseHistoryPdfData) {
    const y = document.y;
    this.labelValue(document, 'Customer', statement.customerName, 48, y, 230);
    this.labelValue(document, 'Email', statement.customerEmail, 48, y + 38, 230);
    this.labelValue(
      document,
      'Statement period',
      `${statement.fromLabel} to ${statement.toLabel}`,
      310,
      y,
      237,
    );
    document.y = y + 82;

    const cardY = document.y;
    const cards: Array<[string, string, string]> = [
      ['ORDERS', String(statement.orderCount), RED],
      ['ITEMS', String(statement.itemCount), ORANGE],
      ['RECORDED VALUE', this.money(statement.totalValue, statement.currency), GOLD],
    ];
    cards.forEach(([label, value, color], index) => {
      const x = 48 + index * 169;
      document.roundedRect(x, cardY, 153, 54, 10).fill(CREAM);
      document
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(color)
        .text(label, x + 10, cardY + 10, { width: 133 });
      document
        .font('Helvetica-Bold')
        .fontSize(index === 2 ? 12 : 17)
        .fillColor(INK)
        .text(value, x + 10, cardY + 27, { width: 133 });
    });
    document.y = cardY + 72;
  }

  private drawTable(document: PDFKit.PDFDocument, statement: PurchaseHistoryPdfData) {
    document.font('Helvetica-Bold').fontSize(12).fillColor(INK).text('Purchased items');
    document.moveDown(0.6);
    this.drawTableHeader(document);

    if (!statement.items.length) {
      document
        .font('Helvetica')
        .fontSize(10)
        .fillColor(MUTED)
        .text('No paid purchases were found for this period.', 56, document.y + 14);
      document.y += 48;
      return;
    }

    for (const item of statement.items) {
      const itemHeight = document.heightOfString(item.productName, { width: 142, lineGap: 1 });
      const storeHeight = document.heightOfString(item.storeName, { width: 72, lineGap: 1 });
      const rowHeight = Math.max(37, itemHeight + 17, storeHeight + 17);
      if (document.y + rowHeight > document.page.height - 98) {
        document.addPage();
        this.drawContinuationHeader(document);
        this.drawTableHeader(document);
      }
      const y = document.y;
      document.rect(48, y, 499, rowHeight).fill('#FFFFFF').strokeColor(BORDER).stroke();
      this.cell(document, item.orderNumber, 55, y + 7, 82, true);
      this.cell(document, this.date(item.purchasedAt), 55, y + 21, 82, false, MUTED, 7);
      this.cell(document, item.storeName, 143, y + 7, 72);
      this.cell(document, item.productName, 221, y + 7, 142, true);
      if (item.productCode) {
        this.cell(document, item.productCode, 221, y + 22, 142, false, MUTED, 7);
      }
      this.cell(document, String(item.quantity), 369, y + 7, 27, false, INK, 8, 'right');
      this.cell(
        document,
        this.money(item.itemTotal, item.currency),
        402,
        y + 7,
        67,
        true,
        INK,
        8,
        'right',
      );
      this.cell(
        document,
        item.paymentStatus.replaceAll('_', ' '),
        475,
        y + 7,
        65,
        true,
        item.paymentStatus === 'REFUNDED' ? MUTED : RED,
        7,
        'right',
      );
      document.y = y + rowHeight;
    }
    document.moveDown(0.8);
    document
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(
        'Paid, partially refunded, and refunded purchases are included. The payment status identifies refunded activity.',
        48,
        document.y,
        { width: 499 },
      );
  }

  private drawTableHeader(document: PDFKit.PDFDocument) {
    const y = document.y;
    document.rect(48, y, 499, 25).fill(INK);
    this.cell(document, 'ORDER', 55, y + 8, 82, true, '#FFFFFF', 7.5);
    this.cell(document, 'STORE', 143, y + 8, 72, true, '#FFFFFF', 7.5);
    this.cell(document, 'ITEM', 221, y + 8, 142, true, '#FFFFFF', 7.5);
    this.cell(document, 'QTY', 369, y + 8, 27, true, '#FFFFFF', 7.5, 'right');
    this.cell(document, 'TOTAL', 402, y + 8, 67, true, '#FFFFFF', 7.5, 'right');
    this.cell(document, 'PAYMENT', 475, y + 8, 65, true, '#FFFFFF', 7.5, 'right');
    document.y = y + 25;
  }

  private drawContinuationHeader(document: PDFKit.PDFDocument) {
    document
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(RED)
      .text(`${this.appName} purchase history - continued`, 48, 38, { width: 499 });
    document.y = 62;
  }

  private drawFooters(document: PDFKit.PDFDocument, statement: PurchaseHistoryPdfData) {
    const range = document.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index++) {
      document.switchToPage(index);
      const y = document.page.height - 76;
      document
        .moveTo(48, y - 9)
        .lineTo(547, y - 9)
        .strokeColor(BORDER)
        .stroke();
      document
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(MUTED)
        .text(this.supportEmail ? `${this.appName} | ${this.supportEmail}` : this.appName, 48, y, {
          width: 390,
          lineBreak: false,
        });
      document.text(`Page ${index + 1}/${range.count}`, 467, y, {
        width: 80,
        align: 'right',
        lineBreak: false,
      });
    }
    document.switchToPage(range.start + range.count - 1);
    document.info.Keywords = `purchase history, ${statement.customerEmail}, ${this.appName}`;
  }

  private labelValue(
    document: PDFKit.PDFDocument,
    label: string,
    value: string,
    x: number,
    y: number,
    width: number,
  ) {
    document
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(ORANGE)
      .text(label.toUpperCase(), x, y, { width });
    document
      .font('Helvetica')
      .fontSize(10)
      .fillColor(INK)
      .text(value || '-', x, y + 13, { width });
  }

  private cell(
    document: PDFKit.PDFDocument,
    value: string,
    x: number,
    y: number,
    width: number,
    bold = false,
    color = INK,
    size = 8,
    align: 'left' | 'right' = 'left',
  ) {
    document
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(size)
      .fillColor(color)
      .text(value, x, y, { width, align, lineGap: 1 });
  }

  private getLogo(): Buffer | undefined {
    if (this.cachedLogo !== undefined) return this.cachedLogo ?? undefined;
    try {
      this.cachedLogo = readFileSync(this.logoPath);
    } catch {
      this.cachedLogo = null;
    }
    return this.cachedLogo ?? undefined;
  }

  private money(value: string, currency: string) {
    return `${currency} ${new Intl.NumberFormat('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value))}`;
  }

  private date(value: Date) {
    return new Intl.DateTimeFormat('en-NG', {
      dateStyle: 'medium',
      timeZone: 'Africa/Lagos',
    }).format(value);
  }

  private dateTime(value: Date) {
    return new Intl.DateTimeFormat('en-NG', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Lagos',
    }).format(value);
  }
}
