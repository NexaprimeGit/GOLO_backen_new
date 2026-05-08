import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OfferPromotion, OfferPromotionDocument } from '../offers/schemas/offer-promotion.schema';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { UsersService } from '../users/users.service';
import { RedisService } from '../common/services/redis.service';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  private readonly categoryAliases: Record<string, string[]> = {
    'food-restaurants': ['Food & Dining', 'Food & Restaurants', 'Food', 'Restaurant', 'Restaurants', 'Cafe', 'Cafes', 'Dining'],
    'home-services': ['Home Services', 'Home Improvement', 'Repair', 'Maintenance', 'Cleaning'],
    'beauty-wellness': ['Beauty', 'Beauty & Wellness', 'Salon', 'Salons', 'Spa', 'Wellness'],
    'healthcare-medical': ['Healthcare', 'Medical', 'Clinic', 'Clinics', 'Hospital', 'Hospitals', 'Pharmacy'],
    'hotels-accommodation': ['Hotels & Accommodation', 'Hotel', 'Hotels', 'Accommodation', 'Travel'],
    'shopping-retail': ['Shopping & Retail', 'Shopping', 'Retail', 'Fashion', 'Apparel'],
    'education-training': ['Education & Training', 'Education', 'Training', 'Courses', 'Institute'],
    'real-estate': ['Real Estate', 'Property', 'Properties', 'Housing'],
    'events-entertainment': ['Events & Entertainment', 'Events', 'Entertainment', 'Ticket', 'Tickets'],
    'professional-services': ['Professional Services', 'Services', 'Consulting'],
    'automotive-services': ['Automotive Services', 'Automotive', 'Vehicle', 'Vehicles'],
    'home-improvement': ['Home Improvement', 'Home Services', 'Renovation', 'Repair'],
    'fitness-sports': ['Fitness & Sports', 'Fitness', 'Sports', 'Gym', 'Workout'],
    'daily-needs': ['Daily Needs & Utilities', 'Daily Needs', 'Utilities', 'Grocery', 'Groceries'],
    'local-businesses-vendors': ['Local Businesses & Vendors', 'Local Businesses', 'Vendors', 'Marketplace'],
  };

  constructor(
    @InjectModel(OfferPromotion.name) private readonly offerModel: Model<OfferPromotionDocument>,
    @InjectModel(Merchant.name) private readonly merchantModel: Model<MerchantDocument>,
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
  ) {}

  private buildCacheKey(userId: string, page: number, limit: number) {
    return `reco:deals:v2:user:${userId}:page:${page}:limit:${limit}`;
  }

  private escapeRegExp(value: string) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private normalizeCategory(value: string) {
    return String(value || '').trim().toLowerCase();
  }

  private getAliasGroups(): Map<string, string[]> {
    // Build a reverse lookup: multiple normalized forms → list of all aliases in that group
    const aliasGroups = new Map<string, string[]>();
    for (const [key, aliases] of Object.entries(this.categoryAliases)) {
      const allTerms = [key, ...aliases];
      for (const term of allTerms) {
        const norm = this.normalizeCategory(term);
        const compact = norm.replace(/[^a-z0-9]+/g, ' ').trim();
        
        // Map both the normalized form and compact form to this alias group
        if (norm) {
          aliasGroups.set(norm, aliases);
        }
        if (compact) {
          aliasGroups.set(compact, aliases);
        }
      }
    }
    return aliasGroups;
  }

  private buildMatchTerms(preferredCategories: string[]) {
    const terms = new Set<string>();
    const aliasGroups = this.getAliasGroups();

    for (const category of preferredCategories) {
      const normalized = this.normalizeCategory(category);
      if (!normalized) continue;

      // Always add the original and normalized forms
      terms.add(category.trim());
      terms.add(normalized);

      // Find all aliases whose group contains this category (either by key or value)
      let matchedAliases: string[] = [];
      
      // Check if the normalized category matches any alias group key (slug)
      if (aliasGroups.has(normalized)) {
        matchedAliases = aliasGroups.get(normalized)!;
      } else {
        // Also check if the original category exactly matches any alias value
        for (const [key, aliases] of Object.entries(this.categoryAliases)) {
          if (aliases.some(alias => this.normalizeCategory(alias) === normalized)) {
            matchedAliases = aliases;
            break;
          }
        }
      }

      // Add all aliases from the matched group
      for (const alias of matchedAliases) {
        terms.add(alias);
      }

      // Add compact version (remove special chars)
      const compact = normalized.replace(/[^a-z0-9]+/g, ' ').trim();
      if (compact) {
        terms.add(compact);
      }
    }

    return Array.from(terms).filter(Boolean);
  }

  private matchesAnyTerm(value: string, terms: string[]) {
    const normalizedValue = this.normalizeCategory(value);
    if (!normalizedValue || !terms.length) return false;

    return terms.some((term) => {
      const normalizedTerm = this.normalizeCategory(term);
      if (!normalizedTerm) return false;
      if (normalizedValue === normalizedTerm) return true;

      // Use word-boundary match to avoid overly broad reverse matches.
      const escapedTerm = this.escapeRegExp(normalizedTerm);
      const wordBoundaryRegex = new RegExp(`(^|\\s)${escapedTerm}(\\s|$)`, 'i');
      return wordBoundaryRegex.test(normalizedValue);
    });
  }

  private roundRobin<T>(groups: T[][], limit: number) {
    const results: T[] = [];
    const queues = groups.map((group) => [...group]);

    let progress = true;
    while (results.length < limit && progress) {
      progress = false;
      for (const queue of queues) {
        if (!queue.length || results.length >= limit) continue;
        results.push(queue.shift() as T);
        progress = true;
      }
    }

    return results;
  }

  private computePricing(row: any) {
    const selectedProducts: any[] = Array.isArray(row?.selectedProducts) ? row.selectedProducts : [];
    const computedBestDiscountPercent = selectedProducts.reduce((best, product) => {
      const original = Number(product?.originalPrice || 0);
      const offerPrice = Number(product?.offerPrice || 0);
      if (original <= 0 || offerPrice < 0 || offerPrice >= original) return best;
      const discountPercent = ((original - offerPrice) / original) * 100;
      return Math.max(best, discountPercent);
    }, 0);

    const summedOfferPrice = selectedProducts.reduce((sum, product) => {
      const value = Number(product?.offerPrice || 0);
      return value > 0 ? sum + value : sum;
    }, 0);

    return {
      selectedProducts,
      displayPrice: summedOfferPrice > 0 ? summedOfferPrice : Number(row?.totalPrice || 0),
      discountPercent: Math.round(computedBestDiscountPercent),
    };
  }

  private rankOffer(row: any, userTerms: string[], merchant?: any) {
    let score = 0;
    const offerCategory = String(row?.category || '');
    const merchantCategory = String(merchant?.storeCategory || '');
    const merchantSubCategory = String(merchant?.storeSubCategory || '');
    const categoryBlob = `${offerCategory} ${merchantCategory} ${merchantSubCategory}`;

    if (this.matchesAnyTerm(offerCategory, userTerms)) score += 8;
    if (this.matchesAnyTerm(merchantCategory, userTerms)) score += 6;
    if (this.matchesAnyTerm(merchantSubCategory, userTerms)) score += 4;
    if (userTerms.some((term) => categoryBlob.toLowerCase().includes(term.toLowerCase()))) score += 2;

    const pricing = this.computePricing(row);
    score += Math.min(5, Math.round((pricing.discountPercent || 0) / 10));

    const createdAtMs = new Date(row?.createdAt || 0).getTime();
    const ageDays = Math.max(0, (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24));
    score += Math.max(0, 4 - Math.min(4, ageDays));

    return score;
  }

  async getRecommendedDeals(userId: string, page = 1, limit = 8) {
    const cacheKey = this.buildCacheKey(userId, page, limit);
    try {
      const cached = await this.redisService.get<any>(cacheKey);
      if (cached) return { data: cached, fromCache: true };

      const user = await this.usersService.findById(userId);
      const preferredCategories = Array.isArray((user as any).preferredCategories)
        ? (user as any).preferredCategories
            .map((item: string) => String(item || '').trim())
            .filter((item: string) => item.length > 0)
        : [];

      if (!preferredCategories.length) {
        return { data: [], fromCache: false };
      }

      const matchTerms = this.buildMatchTerms(preferredCategories);

      const now = new Date();
      const query: any = {
        status: { $in: ['under_review', 'active'] },
        startDate: { $lte: now },
        endDate: { $gte: now },
      };

      const matchedMerchants = await this.merchantModel
        .find({
          status: 'active',
          $or: [
            { storeCategory: { $in: matchTerms.map((term) => new RegExp(this.escapeRegExp(term), 'i')) } },
            { storeSubCategory: { $in: matchTerms.map((term) => new RegExp(this.escapeRegExp(term), 'i')) } },
          ],
        })
        .select('userId storeName storeCategory storeSubCategory')
        .lean()
        .exec();

      const merchantIds = matchedMerchants.map((merchant) => String(merchant.userId));
       const offerRows = await this.offerModel
         .find({
           ...query,
           $or: [
             { merchantId: { $in: merchantIds } },
             { category: { $in: matchTerms.map((term) => new RegExp(this.escapeRegExp(term), 'i')) } },
             { businessCategory: { $in: matchTerms.map((term) => new RegExp(this.escapeRegExp(term), 'i')) } },
           ],
         })
         .select('requestId merchantId merchantName title category businessCategory businessSubCategory totalPrice startDate endDate status createdAt imageUrl selectedProducts')
         .sort({ createdAt: -1 })
         .limit(300)
         .lean()
         .exec();

      const merchantsByUserId = new Map<string, any>(matchedMerchants.map((merchant) => [String(merchant.userId), merchant]));

       const groupedByCategory = new Map<string, any[]>();
       for (const row of offerRows) {
         const merchant = merchantsByUserId.get(String(row.merchantId));
         const allTerms = [
           String(row.category || ''),
           String(row.businessCategory || ''),
           String(row.businessSubCategory || ''),
           String(merchant?.storeCategory || ''),
           String(merchant?.storeSubCategory || ''),
         ].filter(Boolean);

        const matchedCategories = preferredCategories.filter((category) => {
          const normalized = this.normalizeCategory(category);
          const aliases = this.buildMatchTerms([category]);
          return allTerms.some((field) => this.matchesAnyTerm(field, aliases)) || this.matchesAnyTerm(normalized, allTerms);
        });

        if (!matchedCategories.length) continue;

        const bestCategory = matchedCategories[0];
        const pricing = this.computePricing(row);
        const normalizedRow = {
          id: row.requestId || String(row._id),
          title: row.title,
          category: row.category,
          imageUrl: row.imageUrl,
          merchantId: row.merchantId,
          merchantName: row.merchantName,
          totalPrice: Number(row.totalPrice || 0),
          displayPrice: pricing.displayPrice,
          discountPercent: pricing.discountPercent,
          startsAt: row.startDate,
          endsAt: row.endDate,
          score: this.rankOffer(row, matchTerms, merchant),
          matchedCategories,
        };

        if (!groupedByCategory.has(bestCategory)) {
          groupedByCategory.set(bestCategory, []);
        }
        groupedByCategory.get(bestCategory)!.push(normalizedRow);
      }

      const sortedGroups = Array.from(groupedByCategory.values()).map((group) =>
        group.sort((a, b) => b.score - a.score || new Date(b.startsAt || 0).getTime() - new Date(a.startsAt || 0).getTime())
      );
      const mixedRows = this.roundRobin(sortedGroups, limit * 4);
      const offset = Math.max(0, (page - 1) * limit);
      const pagedRows = mixedRows.slice(offset, offset + limit);

      if (pagedRows.length > 0) {
        await this.redisService.set(cacheKey, pagedRows, 180);
      }
      return { data: pagedRows, fromCache: false };
    } catch (err) {
      this.logger.error(`getRecommendedDeals error: ${err?.message || err}`);
      throw err;
    }
  }

  async getDebugInfo(userId: string) {
    try {
      const user = await this.usersService.findById(userId);
      const preferredCategories = Array.isArray((user as any).preferredCategories)
        ? (user as any).preferredCategories
            .map((item: string) => String(item || '').trim())
            .filter((item: string) => item.length > 0)
        : [];

      const matchTerms = this.buildMatchTerms(preferredCategories);

      const now = new Date();
      const totalOffers = await this.offerModel.countDocuments({});
      const validDateStatusOffers = await this.offerModel.countDocuments({
        status: { $in: ['under_review', 'active'] },
        startDate: { $lte: now },
        endDate: { $gte: now },
      });

      const matchedMerchants = await this.merchantModel
        .find({
          status: 'active',
          $or: [
            { storeCategory: { $in: matchTerms.map((term) => new RegExp(this.escapeRegExp(term), 'i')) } },
            { storeSubCategory: { $in: matchTerms.map((term) => new RegExp(this.escapeRegExp(term), 'i')) } },
          ],
        })
        .select('userId storeName storeCategory storeSubCategory')
        .lean()
        .exec();

      const merchantIds = matchedMerchants.map((merchant) => String(merchant.userId));
      const categoryMatchingOffers = await this.offerModel
        .find({
          status: { $in: ['under_review', 'active'] },
          startDate: { $lte: now },
          endDate: { $gte: now },
          $or: [
            { merchantId: { $in: merchantIds } },
            { category: { $in: matchTerms.map((term) => new RegExp(this.escapeRegExp(term), 'i')) } },
          ],
        })
        .select('requestId title category merchantId merchantName startDate endDate status')
        .lean()
        .exec();

      return {
        userPreferredCategories: preferredCategories,
        matchTerms,
        matchedMerchantCount: matchedMerchants.length,
        matchedMerchants: matchedMerchants.slice(0, 5),
        totalOffersInDb: totalOffers,
        offersWithValidDateAndStatus: validDateStatusOffers,
        offersMatchingCategoryAndDateStatus: categoryMatchingOffers.length,
        sampleMatchingOffers: categoryMatchingOffers.slice(0, 3),
      };
    } catch (err) {
      this.logger.error(`getDebugInfo error: ${err?.message || err}`);
      return { error: String(err?.message || err) };
    }
  }
}
