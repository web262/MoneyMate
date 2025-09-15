(function($) {

    $(".toggle-password").click(function() {

        $(this).toggleClass("zmdi-eye zmdi-eye-off");
        var input = $($(this).attr("toggle"));
        if (input.attr("type") == "password") {
          input.attr("type", "text");
        } else {
          input.attr("type", "password");
        }
      });

      "use strict";

	var fullHeight = function() {

		$('.js-fullheight').css('height', $(window).height());
		$(window).resize(function(){
			$('.js-fullheight').css('height', $(window).height());
		});

	};
	fullHeight();

	$(".toggle-password").click(function() {

	  $(this).toggleClass("fa-eye fa-eye-slash");
	  var input = $($(this).attr("toggle"));
	  if (input.attr("type") == "password") {
	    input.attr("type", "text");
	  } else {
	    input.attr("type", "password");
	  }
	});

// Base URL of your Flask backend (make sure your Flask server is running on this address)
const API_BASE_URL = "http://127.0.0.1:5000";

// -----------------------
// Registration
// -----------------------
if (document.getElementById("register-form")) {
  document.getElementById("register-form").addEventListener("submit", async function(e) {
    e.preventDefault();
    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, email, password })
      });
      
      const data = await response.json();
      document.getElementById("register-message").innerText = data.message || data.error;
    } catch (error) {
      console.error("Registration error:", error);
      document.getElementById("register-message").innerText = "Registration failed.";
    }
  });
}

// -----------------------
// Login
// -----------------------
if (document.getElementById("login-form")) {
  document.getElementById("login-form").addEventListener("submit", async function(e) {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      if (data.token) {
        // Save token to localStorage for future requests
        localStorage.setItem("jwtToken", data.token);
        document.getElementById("login-message").innerText = "Login successful! Redirecting to dashboard...";
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 1500);
      } else {
        document.getElementById("login-message").innerText = data.error || "Login failed.";
      }
    } catch (error) {
      console.error("Login error:", error);
      document.getElementById("login-message").innerText = "Login failed.";
    }
  });
  // Example: Summarize expenses by category
let categoryTotals = {};
transactions.forEach(txn => {
  if (txn.type === "expense") {
    categoryTotals[txn.category] = (categoryTotals[txn.category] || 0) + txn.amount;
  }
});

}

// -----------------------
// Dashboard: Fetch Transactions (Example)
// -----------------------
if (document.getElementById("fetch-transactions")) {
  document.getElementById("fetch-transactions").addEventListener("click", async function() {
    const token = localStorage.getItem("jwtToken");
    if (!token) {
      alert("Please log in first.");
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/transactions/all`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      
      const transactions = await response.json();
      let output = "<h3>Your Transactions:</h3>";
      if (Array.isArray(transactions) && transactions.length > 0) {
        transactions.forEach(tran => {
          output += `<p>${tran.date}: ${tran.type} - ${tran.category} - $${tran.amount}</p>`;
        });
      } else {
        output += "<p>No transactions found.</p>";
      }
      document.getElementById("transactions").innerHTML = output;
    } catch (error) {
      console.error("Error fetching transactions:", error);
    }
  });
}


})(jQuery);