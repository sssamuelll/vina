import { beforeEach } from 'vitest';
import { __resetLocaleForTests } from '../../src/i18n/locale';
import { TEST_LOCALE } from '../locale-pin';

beforeEach(() => __resetLocaleForTests(TEST_LOCALE));
