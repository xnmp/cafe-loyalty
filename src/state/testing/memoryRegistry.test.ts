import { describe } from '@jest/globals';

import { createMemoryRegistry } from './memoryRegistry';
import { registryContract } from './registryContract';

describe('memory redemption registry', () => {
  registryContract(createMemoryRegistry);
});
