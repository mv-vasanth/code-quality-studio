describe('checkout', () => {
  it('pays', () => {
    cy.visit('https://staging.example.com/cart');
    cy.wait(3000);
    cy.get('#pay').click();
    cy.get('div > span').contains('Total');
    const token = "abc123secrettoken";
  });
});
