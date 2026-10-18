import type { RedemptionRegistry } from '../counterStore';

export function createMemoryRegistry(): RedemptionRegistry {
  const redemptions = new Map<string, number>();
  const spent = new Map<string, number>();

  return {
    async view(requestId, proofNonceIds) {
      const at = redemptions.get(requestId);
      const requested = new Map<string, number>();
      for (const id of proofNonceIds) {
        const stamps = spent.get(id);
        if (stamps !== undefined) requested.set(id, stamps);
      }
      return { prior: at === undefined ? null : { at }, spent: requested };
    },

    async record(redemption) {
      if (redemptions.has(redemption.requestId)) return 'duplicate';
      // Validate before changing either map to preserve the SQL adapter's all-or-nothing contract.
      if (redemption.spends.some((spend) => !(spend.stamps > 0))) throw new Error('Stamps must be positive');
      redemptions.set(redemption.requestId, redemption.at);
      for (const spend of redemption.spends) {
        spent.set(spend.nonceId, (spent.get(spend.nonceId) ?? 0) + spend.stamps);
      }
      return 'recorded';
    },
  };
}
