const MockUserHistories = (currentHistory = { id: "xyz" }, histories = [{ id: "abc" }]) => ({
    render() {
        return this.$scopedSlots.default({
            currentHistory: currentHistory,
            histories: histories,
            historiesLoading: false,
            handlers: {},
        });
    },
});

export default MockUserHistories;
