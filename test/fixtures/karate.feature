Feature: Users
  Background:
    * configure ssl = true
    * def token = 'eyJhbGciOiJIUzI1NiJ9.hardcodedtokenvalue.sig'
  Scenario: get user
    Given url 'https://staging.api.example.com'
    And path 'users', 1
    And header Authorization = 'Bearer abc123secret'
    When method get
    Then status 200
    * java.lang.Thread.sleep(2000)
