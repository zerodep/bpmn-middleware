import debug from 'debug';

import pkg from '../package.json' with { type: 'json' };

export default debug(pkg.name);
