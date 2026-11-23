import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ReceiptView } from './receipts.service';

const RED = '#FF1B25';
const ORANGE = '#FF7414';
const INK = '#171414';
const CREAM = '#FFF8EE';
const MUTED = '#6B625F';
const BORDER = '#F2DFCA';

@Injectable()
export class ReceiptPdfService {
  private readonly appName: string;
  private readonly supportEmail?: string;
  private readonly businessAddress?: string;
  private readonly businessRegistration?: string;
  private readonly logoPath: string;
  private cachedLogo: Buffer | null | undefined;

  constructor(config: ConfigService) {
    this.appName = config.get<string>('APP_NAME', 'OhoO!');
    this.supportEmail = config.get<string>('RECEIPT_SUPPORT_EMAIL') || undefined;
    this.businessAddress = config.get<string>('RECEIPT_BUSINESS_ADDRESS') || undefined;
    this.businessRegistration = config.get<string>('RECEIPT_BUSINESS_REGISTRATION') || undefined;
    this.logoPath = join(__dirname, '..', 'branding', 'assets', 'ohoo-logo.png');
  }

  async render(receipt: ReceiptView): Promise<Buffer> {
    const document = new PDFDocument({
      size: 'A4',
      margins: { top: 48, right: 48, bottom: 56, left: 48 },
      info: {
        Title: `${this.appName} receipt ${receipt.receiptNumber}`,
        Author: this.appName,
        Subject: 'Payment receipt',
      },
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    const complete = new Promise<Buffer>((resolve, reject) => {
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });

    this.drawHeader(document, receipt);
    this.drawMetadata(document, receipt);
    this.drawOrders(document, receipt);
    this.drawTotals(document, receipt);
    this.drawRefunds(document, receipt);
    this.drawFooter(document, receipt);
    document.end();
    return complete;
  }

  private drawHeader(document: PDFKit.PDFDocument, receipt: ReceiptView) {
    const top = 36;
    document.roundedRect(36, top, 523, 92, 18).fill(CREAM);
    const logo = this.getLogo();
    if (logo) {
      document.image(logo, 52, top + 17, {
        cover: [142, 58],
        align: 'center',
        valign: 'center',
      });
    } else {
      document
        .font('Helvetica-Bold')
        .fontSize(24)
        .fillColor(RED)
        .text(this.appName, 52, top + 32);
    }
    document
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor(INK)
      .text('PAYMENT RECEIPT', 300, top + 25, { width: 235, align: 'right' });
    document
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(receipt.receiptNumber, 300, top + 55, { width: 235, align: 'right' });
    document.y = top + 118;
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

  private drawMetadata(document: PDFKit.PDFDocument, receipt: ReceiptView) {
    const startY = document.y;
    this.labelValue(document, 'Customer', receipt.customer.name, 48, startY, 235);
    this.labelValue(document, 'Email', receipt.customer.email, 48, startY + 38, 235);
    this.labelValue(document, 'Issued', this.date(receipt.issuedAt), 312, startY, 235);
    this.labelValue(
      document,
      'Payment method',
      this.title(receipt.payment.method),
      312,
      startY + 38,
      235,
    );
    this.labelValue(document, 'Payment reference', receipt.payment.reference, 48, startY + 76, 385);
    document
      .roundedRect(453, startY + 74, 94, 25, 12)
      .fill(
        receipt.status === 'REFUNDED'
          ? MUTED
          : receipt.status === 'PARTIALLY_REFUNDED'
            ? ORANGE
            : RED,
      );
    document
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#FFFFFF')
      .text(receipt.status.replaceAll('_', ' '), 457, startY + 82, {
        width: 86,
        align: 'center',
      });
    document.y = startY + 128;
  }

  private drawOrders(document: PDFKit.PDFDocument, receipt: ReceiptView) {
    for (const order of receipt.orders) {
      this.ensureSpace(document, 100);
      document
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor(INK)
        .text(order.store.name || 'Store', 48, document.y, { continued: true })
        .font('Helvetica')
        .fontSize(9)
        .fillColor(MUTED)
        .text(`   ${order.orderNumber}`);
      document.moveDown(0.6);
      const headerY = document.y;
      document.rect(48, headerY, 499, 23).fill(INK);
      this.tableText(document, 'Item', 56, headerY + 7, 275, '#FFFFFF', true);
      this.tableText(document, 'Qty', 342, headerY + 7, 40, '#FFFFFF', true, 'right');
      this.tableText(document, 'Price', 393, headerY + 7, 65, '#FFFFFF', true, 'right');
      this.tableText(document, 'Total', 469, headerY + 7, 70, '#FFFFFF', true, 'right');
      document.y = headerY + 28;
      for (const item of order.items) {
        this.ensureSpace(document, 34);
        const rowY = document.y;
        const itemHeight = Math.max(
          28,
          document.heightOfString(item.name, { width: 275, lineGap: 1 }) + 13,
        );
        document.rect(48, rowY, 499, itemHeight).fill('#FFFFFF').strokeColor(BORDER).stroke();
        this.tableText(document, item.name, 56, rowY + 8, 275, INK);
        this.tableText(document, String(item.quantity), 342, rowY + 8, 40, INK, false, 'right');
        this.tableText(
          document,
          this.money(item.unitPrice, receipt.currency),
          393,
          rowY + 8,
          65,
          INK,
          false,
          'right',
        );
        this.tableText(
          document,
          this.money(item.total, receipt.currency),
          469,
          rowY + 8,
          70,
          INK,
          false,
          'right',
        );
        document.y = rowY + itemHeight;
      }
      document.moveDown(1);
    }
  }

  private drawTotals(document: PDFKit.PDFDocument, receipt: ReceiptView) {
    this.ensureSpace(document, 150);
    const x = 315;
    const width = 232;
    const rows: Array<[string, string, boolean]> = [
      ['Subtotal', this.money(receipt.totals.subtotal, receipt.currency), false],
      ['Delivery', this.money(receipt.totals.shippingFee, receipt.currency), false],
      ['Discount', `-${this.money(receipt.totals.discountAmount, receipt.currency)}`, false],
      ['Tax', this.money(receipt.totals.taxAmount, receipt.currency), false],
      ['Total paid', this.money(receipt.totals.totalAmount, receipt.currency), true],
    ];
    for (const [label, value, total] of rows) {
      const y = document.y;
      if (total) document.roundedRect(x, y - 5, width, 30, 8).fill(CREAM);
      document
        .font(total ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(total ? 12 : 10)
        .fillColor(total ? RED : MUTED)
        .text(label, x + 8, y + 3, { width: 100 });
      document
        .font(total ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(total ? 12 : 10)
        .fillColor(total ? RED : INK)
        .text(value, x + 108, y + 3, { width: 116, align: 'right' });
      document.y = y + (total ? 34 : 24);
    }
  }

  private drawRefunds(document: PDFKit.PDFDocument, receipt: ReceiptView) {
    if (!receipt.refunds.length) return;
    this.ensureSpace(document, 76);
    document
      .moveDown(0.5)
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(INK)
      .text('Refund activity');
    for (const refund of receipt.refunds) {
      document
        .font('Helvetica')
        .fontSize(9)
        .fillColor(MUTED)
        .text(
          `${refund.status.replaceAll('_', ' ')} - ${this.money(refund.amount, refund.currency)} - ${refund.orderNumber}`,
        );
    }
  }

  private drawFooter(document: PDFKit.PDFDocument, receipt: ReceiptView) {
    const range = document.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index++) {
      document.switchToPage(index);
      const y = document.page.height - 68;
      document
        .moveTo(48, y - 10)
        .lineTo(547, y - 10)
        .strokeColor(BORDER)
        .stroke();
      const details = [this.businessAddress, this.businessRegistration, this.supportEmail]
        .filter(Boolean)
        .join('  |  ');
      document
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(MUTED)
        .text(details || `Generated securely by ${this.appName}`, 48, y, {
          width: 410,
          lineBreak: false,
        });
      document.text(`Page ${index + 1}/${range.count}`, 467, y, {
        width: 80,
        align: 'right',
      });
    }
    document.switchToPage(range.start + range.count - 1);
    document.info.Keywords = `receipt, ${receipt.receiptNumber}, ${this.appName}`;
  }

  private ensureSpace(document: PDFKit.PDFDocument, height: number) {
    if (document.y + height > document.page.height - 70) document.addPage();
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
      .fontSize(8)
      .fillColor(ORANGE)
      .text(label.toUpperCase(), x, y, { width });
    document
      .font('Helvetica')
      .fontSize(10)
      .fillColor(INK)
      .text(value || '-', x, y + 13, {
        width,
      });
  }

  private tableText(
    document: PDFKit.PDFDocument,
    value: string,
    x: number,
    y: number,
    width: number,
    color: string,
    bold = false,
    align: 'left' | 'right' = 'left',
  ) {
    document
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8.5)
      .fillColor(color)
      .text(value, x, y, { width, align, lineGap: 1 });
  }

  private money(value: string, currency: string) {
    const amount = new Intl.NumberFormat('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value));
    return `${currency} ${amount}`;
  }

  private date(value: string) {
    return new Intl.DateTimeFormat('en-NG', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Lagos',
    }).format(new Date(value));
  }

  private title(value: string) {
    return value
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}
