import axios from 'axios';
import qs from 'qs';

class Facebook {
  constructor() {
    this.apiUrl = "https://v3.fdownloader.net/api/ajaxSearch?lang=en";
    this.headers = {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Accept": "*/*"
    };
  }

  async download(vi) {
    const requestData = qs.stringify({
      k_exp: "1732847386",
      k_token: process.env.FDOWNLOADER_K_TOKEN || "",
      q: vi,
      lang: "en",
      web: "fdownloader.net",
      v: "v2",
      w: "",
    });
    try {
      const response = await axios.post(this.apiUrl, requestData, {
        headers: this.headers
      });
      if (response.data.status === "ok" && response.data.data) {
        const html = response.data.data;
        const downloadLinks = {};
        const matches = [...html.matchAll(/<a href="([^"]+)"[^>]*title="Download ([^"]+)"/g)];
        for (const match of matches) {
          const url = match[1];
          const resolution = match[2];
          downloadLinks[resolution] = url;
        }

        return {
          author: "naxor",
          status: 200,
          data: downloadLinks,
        };
      }

      return {
        author: "naxor",
        status: 400,
        message: "No download links found",
      };
    } catch (error) {
      return {
        author: "naxor",
        status: 500,
        error: error.message,
      };
    }
  }
}

export default Facebook;
