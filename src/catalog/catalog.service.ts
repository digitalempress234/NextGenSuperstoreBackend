import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryDto,
  CreateProductDto,
  ProductSearchDto,
  UpdateProductDto,
} from './dto/catalog.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: ProductSearchDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where = {
      status: true,
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q } },
              { brand: { contains: query.q } },
              { barcode: query.q },
            ],
          }
        : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: true,
          images: { orderBy: { sortOrder: 'asc' } },
          offers: {
            where: { isActive: true, availability: true },
            include: { store: true },
            orderBy: { price: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  async one(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        offers: {
          where: { isActive: true, availability: true },
          include: { store: true },
          orderBy: { price: 'asc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    return product;
  }

  categories() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
      include: { children: { where: { isActive: true }, orderBy: { name: 'asc' } } },
    });
  }

  async getCategory(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found.');
    }

    return category;
  }

  async createCategory(dto: CreateCategoryDto) {
    let level = 0;

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });

      if (!parent) {
        throw new NotFoundException('Parent category not found.');
      }

      level = parent.level + 1;
    }

    return this.prisma.category.create({
      data: {
        name: dto.name,
        parentId: dto.parentId,
        level,
      },
    });
  }

  async createProduct(dto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        brand: dto.brand,
        barcode: dto.barcode,
        description: dto.description,
        unit: dto.unit,
        categoryId: dto.categoryId,
        status: dto.status ?? true,
      },
    });

    if (dto.images?.length) {
      await this.prisma.productImage.createMany({
        data: dto.images.map((url, index) => ({
          productId: product.id,
          url,
          sortOrder: index,
        })),
      });
    }

    return this.one(product.id);
  }

  async updateProduct(id: number, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Product not found.');
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        brand: dto.brand,
        barcode: dto.barcode,
        description: dto.description,
        unit: dto.unit,
        categoryId: dto.categoryId,
        status: dto.status,
      },
      include: { category: true, images: true },
    });
  }

  async archiveProduct(id: number) {
    const existing = await this.prisma.product.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Product not found.');
    }

    return this.prisma.product.update({
      where: { id },
      data: { status: false },
    });
  }
}
