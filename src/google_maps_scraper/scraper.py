"""
    Module for scraping Google Maps.
"""

import logging
import time

from typing import List

from selenium import webdriver
from selenium.common.exceptions import NoSuchElementException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

from google_maps_scraper.models import Location


logging.getLogger("WDM").setLevel(logging.ERROR)


class ConsentFormAcceptError(BaseException):
    message = "Unable to accept Google consent form."


class DriverInitializationError(BaseException):
    message = "Unable to initialize Chrome webdriver for scraping."


class DriverGetMapsDataError(BaseException):
    message = "Unable to get Google Maps data with Chrome webdriver."


class GoogleMapsScraper:
    """Class for scraping Google Maps"""

    def __init__(self, logger: logging.Logger | None = None) -> None:
        self._logger = logger if logger else logging.getLogger(__name__)
        self._consent_button_xpath = "/html/body/c-wiz/div/div/div/div[2]/div[1]/div[3]/div[1]/div[1]/form[2]/div/div/button/span"

    def _init_chrome_driver(self) -> webdriver.Chrome:
        """Initializes Chrome webdriver"""
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        service = Service(ChromeDriverManager().install())
        return webdriver.Chrome(service=service, options=chrome_options)

    def _click_consent_button(self, driver: webdriver.Chrome, url: str) -> None:
        """Clicks google consent form with selenium Chrome webdriver"""
        self._logger.info("Accepting consent form..")
        try:
            driver.get(url)
            consent_button = driver.find_element(
                By.XPATH,
                self._consent_button_xpath,
            )
            consent_button.click()
        except NoSuchElementException:
            self._logger.warning("Consent form button not found.")
        except Exception as e:
            raise ConsentFormAcceptError from e

        time.sleep(2)

    def _scroll_results_container(
        self, driver: webdriver.Chrome, container: webdriver.Chrome
    ) -> None:
        """Scrolls the results container to load all available listings."""
        last_height = driver.execute_script(
            "return arguments[0].scrollHeight", container
        )
        
        # Track consecutive scrolls without new content
        no_change_count = 0
        max_no_change = 5  # Allow multiple attempts before giving up
        
        scroll_count = 0
        max_scrolls = 100  # Prevent infinite loops
        
        self._logger.info("Starting to scroll results container...")
        
        while scroll_count < max_scrolls:
            # Scroll to bottom
            driver.execute_script(
                "arguments[0].scrollTop = arguments[0].scrollHeight", container
            )
            
            # Wait for content to load
            time.sleep(3)  # Increased wait time for lazy loading
            
            # Get new height
            new_height = driver.execute_script(
                "return arguments[0].scrollHeight", container
            )
            
            scroll_count += 1
            
            if new_height == last_height:
                no_change_count += 1
                self._logger.debug(f"No new content loaded (attempt {no_change_count}/{max_no_change})")
                
                if no_change_count >= max_no_change:
                    self._logger.info(f"Reached end of results after {scroll_count} scrolls")
                    break
            else:
                # New content loaded, reset counter
                no_change_count = 0
                self._logger.info(f"Scroll {scroll_count}: Loaded more results (height: {last_height} → {new_height})")
                last_height = new_height

    def _get_data_from_location_div(self, div: webdriver.Chrome) -> Location | None:
        """Retrieves location data from a div element and returns it as an Location object."""
        try:
            title_element = div.find_element(By.CLASS_NAME, "hfpxzc")
            title = title_element.get_attribute("aria-label")
            url = title_element.get_attribute("href")
            
            # Rating might not always be present
            try:
                rating = div.find_element(By.CLASS_NAME, "ZkP5Je").get_attribute("aria-label")
            except NoSuchElementException:
                rating = "No rating"
            
            return Location(title=title, rating=rating, url=url, website=None)
        except Exception as e:
            self._logger.warning(f"Failed to extract data from location div: {e}")
            return None

    def _get_website_from_location_page(self, driver: webdriver.Chrome) -> str | None:
        """Extracts the website URL from a location's detail page."""
        try:
            # Try to find the website link using the data-value attribute
            website_element = driver.find_element(By.XPATH, "//a[@data-value='Website']")
            website_url = website_element.get_attribute("href")
            return website_url
        except NoSuchElementException:
            return None
        except Exception as e:
            self._logger.debug(f"Error extracting website: {e}")
            return None

    def _get_locations_from_page(
        self, url: str, driver: webdriver.Chrome, full: bool | None = False
    ) -> List[Location]:
        """Retrieves location data from a Google Maps search page."""
        driver.get(url)
        time.sleep(2)

        if full:
            # Try multiple possible XPaths for the results container
            result_container_xpaths = [
                "//div[contains(@aria-label, 'Results for')]",
                "//div[@role='feed']",
                "//div[contains(@class, 'm6QErb')]",
            ]
            
            results_container = None
            for xpath in result_container_xpaths:
                try:
                    results_container = driver.find_element(By.XPATH, xpath)
                    self._logger.info(f"Found results container using XPath: {xpath}")
                    break
                except NoSuchElementException:
                    continue
            
            if results_container:
                # Check initial count
                initial_divs = driver.find_elements(By.CLASS_NAME, "Nv2PK")
                self._logger.info(f"Initial results count: {len(initial_divs)}")
                
                self._scroll_results_container(driver, results_container)
                time.sleep(2)
                
                # Check final count after scrolling
                final_divs = driver.find_elements(By.CLASS_NAME, "Nv2PK")
                self._logger.info(f"After scrolling: {len(final_divs)} results loaded")
            else:
                self._logger.warning("Could not find results container to scroll. Proceeding with visible results only.")

        location_divs = driver.find_elements(By.CLASS_NAME, "Nv2PK")
        self._logger.info(f"Found {len(location_divs)} location divs")
        
        locations = []
        for idx, div in enumerate(location_divs):
            location = self._get_data_from_location_div(div)
            if location:
                # Click on the location to open its detail page
                try:
                    title_element = div.find_element(By.CLASS_NAME, "hfpxzc")
                    title_element.click()
                    time.sleep(1.5)  # Wait for the detail page to load
                    
                    # Extract website from the detail page
                    website = self._get_website_from_location_page(driver)
                    location.website = website
                    
                    self._logger.debug(f"Location {idx + 1}/{len(location_divs)}: {location.title} - Website: {website or 'Not found'}")
                except Exception as e:
                    self._logger.debug(f"Could not extract website for location: {e}")
                
                locations.append(location)
        
        self._logger.info(f"Successfully extracted {len(locations)} locations")
        return locations

    def get_maps_data(self, url: str, full: bool | None = False) -> List[Location]:
        """
        Retrieves a list of locations in Google Maps for a given URL.

        Returns:
            List[Location]: A list of Location objects.
        Raises:
            ConsentFormAcceptError: If the Google consent form cannot be accepted.
            DriverInitializationError: If the Chrome webdriver cannot be initialized.
            DriverGetLocationDataError: If the location data cannot be scraped from the Google Maps site.
        """
        self._logger.info(f"Retrieving data from Google Maps for query {url}..")
        try:
            driver = self._init_chrome_driver()
        except Exception as e:
            raise DriverInitializationError from e

        try:
            self._click_consent_button(driver, url)
        except Exception as e:
            driver.close()
            raise e

        self._logger.info("Scraping Google Maps page..")
        try:
            return self._get_locations_from_page(url, driver, full)
        except Exception as e:
            raise DriverGetMapsDataError from e
        finally:
            driver.close()
