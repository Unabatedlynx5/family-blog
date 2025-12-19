/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
	theme: {
		extend: {
			colors: {
				accent: '#2337ff',
				'accent-dark': '#000d8a',
				black: 'rgb(15, 18, 25)',
				gray: 'rgb(96, 115, 159)',
				'gray-light': 'rgb(229, 233, 240)',
				'gray-dark': 'rgb(34, 41, 57)',
				muted: '#6b7280',
				'input-border': '#e6e9ef',
				'card-bg': '#ffffff',
				surface: 'rgba(15,18,25,0.02)',
			},
			fontFamily: {
				sans: ['Atkinson', 'sans-serif'],
			}
		},
	},
	plugins: [],
}
