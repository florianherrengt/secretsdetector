document.addEventListener('DOMContentLoaded', () => {
	const elements = document.querySelectorAll('time[datetime]');
	for (const el of elements) {
		const datetimeValue = el.getAttribute('datetime');
		const date = new Date(datetimeValue);
		if (!isNaN(date.getTime())) {
			el.textContent = date.toLocaleString();
		}
	}
});
