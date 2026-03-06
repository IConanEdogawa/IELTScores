function goBack() {
    if (window.history.length > 1) {
        window.history.back();
        return;
    }

    window.location.href = 'main.html';
}
