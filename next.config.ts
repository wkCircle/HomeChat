import type { NextConfig } from 'next';
import fs from 'fs';

const isDocker = process.env.DOCKER === '1' || (fs.existsSync ? fs.existsSync('/.dockerenv') : false);
const backendBase = isDocker ? 'http://home_ai:8010' : 'http://localhost:8010';

const nextConfig: NextConfig = {
	async rewrites() {
		return [
			{
				source: '/api/:path*',
				destination: `${backendBase}/api/:path*`,
			},
		];
	},
};

export default nextConfig;
