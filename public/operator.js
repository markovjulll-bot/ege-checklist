// ДАННЫЕ ОПЕРАТОРА — впиши свои и сохрани. Они подставятся в политику и согласие на сайте.
window.OPERATOR = {
  fio: "Маркова Юлия Игоревна",          // полностью, как в паспорте
  status: "самозанятый (плательщик налога на профессиональный доход)",
  inn: "",                              // ИНН — по желанию, можно оставить пустым
  email: "",                            // почта для запросов по данным
  telegram: "@ffggfffg",
  updated: "19 октября 2026 г."          // дата редакции документов
};

// Подстановка в страницы (трогать не нужно)
document.addEventListener("DOMContentLoaded", function () {
  var o = window.OPERATOR;
  var contacts = [o.telegram ? "Telegram " + o.telegram : "", o.email ? "почта " + o.email : ""].filter(Boolean).join(", ");
  var vals = { fio: o.fio, status: o.status, inn: o.inn ? ", ИНН " + o.inn : "", contacts: contacts, updated: o.updated };
  document.querySelectorAll("[data-op]").forEach(function (el) {
    var v = vals[el.getAttribute("data-op")];
    if (v !== undefined) el.textContent = v;
  });
});
